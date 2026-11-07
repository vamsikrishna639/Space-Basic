import request from 'supertest';
import type { Express } from 'express';
import { CONSENT_POLICY_VERSION } from '@spacebasic/shared';
import { createApp } from '../../app';
import { useTestDb } from '../../test/db';
import { CONSENT, ORIGIN, makeInstitution, makeUser, refreshCookie } from '../../test/factory';
import { AuditModel } from '../../core/audit/audit';
import { SessionModel } from '../auth/auth.models';
import { ConsentModel } from './consent.model';

useTestDb();

let app: Express;
beforeEach(() => { app = createApp(); });

const login = (email: string, consent: object | null = CONSENT) =>
  request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123', ...(consent ? { consent } : {}) });
const refresh = (cookie: string) =>
  request(app).post('/api/v1/auth/refresh').set({ 'X-SB-Client': '1', Origin: ORIGIN, Cookie: `sb_rt=${cookie}` });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function signedIn(email = 'arjun@example.com') {
  const inst = await makeInstitution();
  const user = await makeUser(inst._id, { email });
  const res = await login(email);
  expect(res.status).toBe(200);
  return { inst, user, token: res.body.accessToken as string, cookie: refreshCookie(res)! };
}

describe('GET /consent/policy', () => {
  it('is public and names the current policy version', async () => {
    const res = await request(app).get('/api/v1/consent/policy');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ policyVersion: CONSENT_POLICY_VERSION, url: '/privacy' });
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });
});

describe('GET /consent/me', () => {
  it('shows the consent given at sign-in, without the ip / user-agent evidence', async () => {
    const { token } = await signedIn();
    const res = await request(app).get('/api/v1/consent/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.current).toEqual({ policyVersion: CONSENT_POLICY_VERSION, acceptedAt: expect.any(String) });
    expect(res.body.history).toEqual([{ policyVersion: CONSENT_POLICY_VERSION, acceptedAt: res.body.current.acceptedAt, withdrawnAt: null, source: 'signin' }]);
    expect(JSON.stringify(res.body)).not.toMatch(/ip|userAgent|127\.0\.0\.1/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).get('/api/v1/consent/me')).status).toBe(401);
  });

  it('a second sign-in does not add a duplicate record', async () => {
    const { token } = await signedIn();
    await login('arjun@example.com');
    const res = await request(app).get('/api/v1/consent/me').set(auth(token));
    expect(res.body.history).toHaveLength(1);
  });
});

describe('POST /consent/withdraw', () => {
  it('needs an explicit confirmation', async () => {
    const { token } = await signedIn();
    expect((await request(app).post('/api/v1/consent/withdraw').set(auth(token)).send({})).status).toBe(400);
    expect((await request(app).post('/api/v1/consent/withdraw').set(auth(token)).send({ confirm: 'yes' })).status).toBe(400);
  });

  it('withdraws, clears the cookie, ends every session at once, and is audited', async () => {
    const { user, token, cookie } = await signedIn();
    const other = await login('arjun@example.com'); // a second device
    const res = await request(app).post('/api/v1/consent/withdraw').set(auth(token)).send({ confirm: true });
    expect(res.status).toBe(204);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sb_rt='));
    expect(setCookie).toMatch(/^sb_rt=;.*Path=\/api\/v1\/auth.*Expires=Thu, 01 Jan 1970/);

    expect((await request(app).get('/api/v1/users/me').set(auth(token))).status).toBe(401);
    expect((await request(app).get('/api/v1/users/me').set(auth(other.body.accessToken))).status).toBe(401);
    expect((await refresh(cookie)).status).toBe(401);
    expect((await refresh(refreshCookie(other)!)).status).toBe(401);

    const sessions = await SessionModel.find({ institutionId: user.institutionId, userId: user._id }).lean();
    expect(sessions.map((s) => s.revokedReason)).toEqual(['consent_withdrawn', 'consent_withdrawn']);
    const record = await ConsentModel.findOne({ institutionId: user.institutionId, userId: user._id }).lean();
    expect(record?.withdrawnAt).toBeInstanceOf(Date);
    const entry = await AuditModel.findOne({ action: 'consent.withdraw', actorId: user._id }).lean();
    expect(entry?.meta).toEqual({ records: 1, sessionsRevoked: 2 });
  });

  it('signing in again needs the box ticked, and is recorded as a re-consent next to the withdrawn record', async () => {
    const { token } = await signedIn();
    await request(app).post('/api/v1/consent/withdraw').set(auth(token)).send({ confirm: true });
    expect((await login('arjun@example.com', null)).status).toBe(400);
    const again = await login('arjun@example.com');
    expect(again.status).toBe(200);
    expect(again.body.user.consent).toEqual({ policyVersion: CONSENT_POLICY_VERSION, acceptedAt: expect.any(String) });
    const mine = await request(app).get('/api/v1/consent/me').set(auth(again.body.accessToken));
    expect(mine.body.history.map((h: { source: string; withdrawnAt: string | null }) => [h.source, h.withdrawnAt === null])).toEqual([
      ['reconsent', true],
      ['signin', false],
    ]);
  });

  it("only touches the caller's own records", async () => {
    const a = await signedIn('a@example.com');
    const bUser = await makeUser(a.inst._id, { email: 'b@example.com' });
    const b = await login('b@example.com');
    await request(app).post('/api/v1/consent/withdraw').set(auth(a.token)).send({ confirm: true });
    expect(await ConsentModel.exists({ institutionId: a.inst._id, userId: bUser._id, withdrawnAt: null })).toBeTruthy();
    expect((await request(app).get('/api/v1/users/me').set(auth(b.body.accessToken))).status).toBe(200);
  });
});

describe('refresh needs an active consent for the current policy', () => {
  it('after a policy version bump the session ends with CONSENT_REQUIRED and the cookie is cleared', async () => {
    const { user, cookie } = await signedIn();
    // Simulate a new policy version: the stored consent now refers to an older one.
    await ConsentModel.updateMany({ institutionId: user.institutionId, userId: user._id }, { $set: { policyVersion: '2020-01-01' } });
    const res = await refresh(cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).some((c) => c.startsWith('sb_rt=;'))).toBe(true);
    const session = await SessionModel.findOne({ institutionId: user.institutionId, userId: user._id }).lean();
    expect(session?.revokedReason).toBe('consent_required');
    // Signing in with the box ticked records consent to the new version.
    const again = await login('arjun@example.com');
    expect(again.status).toBe(200);
    expect(again.body.user.consent.policyVersion).toBe(CONSENT_POLICY_VERSION);
  });

  it('refresh still works while the consent is active', async () => {
    const { cookie } = await signedIn();
    expect((await refresh(cookie)).status).toBe(200);
  });
});
