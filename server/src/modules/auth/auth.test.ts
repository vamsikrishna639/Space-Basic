import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { useTestDb } from '../../test/db';
import { CONSENT, ORIGIN, makeInstitution, makeRoom, makeUser, refreshCookie } from '../../test/factory';
import { testOutbox } from '../../providers/otp/console';
import { SessionModel } from './auth.models';
import { ConsentModel } from '../consent/consent.model';
import { UserModel } from '../users/user.model';
import { AuditModel } from '../../core/audit/audit';
import { TenantScopeError } from '../../core/db/tenant';
import { REFRESH_REUSE_GRACE_MS } from './auth.service';

useTestDb();

let app: Express;
beforeEach(() => {
  app = createApp(); // fresh in-memory rate-limit stores per test
  testOutbox.length = 0;
});

const GENERIC = "We couldn't sign you in with those details.";

async function setup() {
  const inst = await makeInstitution();
  const room = await makeRoom(inst._id, 'CS240');
  const student = await makeUser(inst._id, { email: 'arjun@example.com', phone: '+919876543210', password: 'Student@2026', roomId: room._id });
  return { inst, room, student };
}

async function login(email = 'arjun@example.com', password = 'Student@2026') {
  return request(app).post('/api/v1/auth/login').send({ email, password, consent: CONSENT });
}

const refresh = (cookie?: string, headers: Record<string, string> = { 'X-SB-Client': '1', Origin: ORIGIN }) => {
  const r = request(app).post('/api/v1/auth/refresh').set(headers);
  return cookie ? r.set('Cookie', `sb_rt=${cookie}`) : r;
};

async function nextCode(): Promise<{ code: string; to: string; purpose: string }> {
  for (let i = 0; i < 50 && testOutbox.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  const m = testOutbox.shift();
  if (!m) throw new Error('no OTP delivered');
  return m;
}

describe('POST /auth/login (email + password)', () => {
  it('signs in, returns the profile, sets the refresh cookie and records consent', async () => {
    const { student } = await setup();
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.expiresIn).toBe(900);
    expect(res.body.user).toMatchObject({ email: 'arjun@example.com', firstName: 'Test', roles: ['student'], room: { display: 'West CS240' } });
    expect(res.body.user.consent.policyVersion).toBe(CONSENT.policyVersion);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/sb_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await ConsentModel.countDocuments({ institutionId: student.institutionId, userId: student._id })).toBe(1);
    // a second sign-in does not duplicate the consent record
    await login();
    expect(await ConsentModel.countDocuments({ institutionId: student.institutionId, userId: student._id })).toBe(1);
  });

  it('never returns the password hash', async () => {
    await setup();
    const res = await login();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2b\$/);
  });

  it('requires the consent box (server-side, not just the UI)', async () => {
    await setup();
    const missing = await request(app).post('/api/v1/auth/login').send({ email: 'arjun@example.com', password: 'Student@2026' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(missing.body.error.fields).some((k) => k.startsWith('consent'))).toBe(true);
    const unticked = await request(app).post('/api/v1/auth/login').send({ email: 'arjun@example.com', password: 'Student@2026', consent: { accepted: false, policyVersion: CONSENT.policyVersion } });
    expect(unticked.status).toBe(400);
    const oldPolicy = await request(app).post('/api/v1/auth/login').send({ email: 'arjun@example.com', password: 'Student@2026', consent: { accepted: true, policyVersion: '2020-01-01' } });
    expect(oldPolicy.status).toBe(400);
  });

  it('gives the same generic 401 for a wrong password, an unknown email, a disabled user and a user without a password', async () => {
    const { inst } = await setup();
    await makeUser(inst._id, { email: 'off@example.com', password: 'Student@2026', status: 'disabled' });
    await makeUser(inst._id, { email: 'nopass@example.com', password: '' });
    for (const [email, pw] of [['arjun@example.com', 'wrong-pass'], ['nobody@example.com', 'Student@2026'], ['off@example.com', 'Student@2026'], ['nopass@example.com', 'x']]) {
      const res = await login(email, pw);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: GENERIC });
    }
  });

  it('normalises the email (case / spaces)', async () => {
    await setup();
    expect((await login('  ARJUN@Example.com ')).status).toBe(200);
  });

  it('rejects NoSQL operator injection', async () => {
    await setup();
    const res = await request(app).post('/api/v1/auth/login').send({ email: { $ne: null }, password: { $ne: null }, consent: CONSENT });
    expect(res.status).toBe(400);
  });

  it('locks the identifier after 10 failures in 15 minutes (429 with Retry-After)', async () => {
    await setup();
    for (let i = 0; i < 10; i++) expect((await login('arjun@example.com', `bad-${i}`)).status).toBe(401);
    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('access token + GET /users/me', () => {
  it('accepts a valid token and rejects missing / malformed ones', async () => {
    await setup();
    const { body } = await login();
    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.room.display).toBe('West CS240');
    expect((await request(app).get('/api/v1/users/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/users/me').set('Authorization', 'Bearer nope')).body.error.code).toBe('UNAUTHENTICATED');
  });

  it('stops accepting the token as soon as the user is disabled', async () => {
    const { student } = await setup();
    const { body } = await login();
    await UserModel.updateOne({ _id: student._id, institutionId: student.institutionId }, { $set: { status: 'disabled' } });
    expect((await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${body.accessToken}`)).status).toBe(401);
  });
});

describe('POST /auth/refresh (rotation + reuse detection)', () => {
  it('requires the client header and an allowed Origin (CSRF defence)', async () => {
    await setup();
    const cookie = refreshCookie(await login())!;
    expect((await refresh(cookie, { Origin: ORIGIN })).status).toBe(403);
    expect((await refresh(cookie, { 'X-SB-Client': '1', Origin: 'https://evil.example' })).status).toBe(403);
    expect((await refresh(undefined)).status).toBe(401);
  });

  it('rotates the refresh token and issues a new access token', async () => {
    await setup();
    const c1 = refreshCookie(await login())!;
    const res = await refresh(c1);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const c2 = refreshCookie(res)!;
    expect(c2).toBeDefined();
    expect(c2).not.toBe(c1);
    expect((await refresh(c2)).status).toBe(200);
  });

  it('a cut-off rotation: the immediately previous token works ONCE more within 10 s, with a new cookie', async () => {
    const { student } = await setup();
    const c1 = refreshCookie(await login())!;
    await refresh(c1); // its answer (c2) never reaches the browser: the page load was cut off
    const again = await refresh(c1);
    expect(again.status).toBe(200);
    const c3 = refreshCookie(again)!;
    expect(c3).not.toBe(c1);
    expect((await refresh(c3)).status).toBe(200); // the session carries on from the new cookie
    // c1 is now older than the immediately previous token: using it again is reuse
    const reuse = await refresh(c1);
    expect(reuse.status).toBe(401);
    const s = await SessionModel.findOne({ institutionId: student.institutionId, userId: student._id }).lean();
    expect(s?.revokedReason).toBe('reuse_detected');
  });

  it('a token two rotations back is reuse even inside the 10 s window', async () => {
    const { student } = await setup();
    const c1 = refreshCookie(await login())!;
    const c2 = refreshCookie(await refresh(c1))!;
    refreshCookie(await refresh(c2));
    expect((await refresh(c1)).status).toBe(401);
    const s = await SessionModel.findOne({ institutionId: student.institutionId, userId: student._id }).lean();
    expect(s?.revokedReason).toBe('reuse_detected');
  });

  it('two refreshes with the same token at the same moment both succeed (one rotates, the other rotates again)', async () => {
    await setup();
    const c1 = refreshCookie(await login())!;
    const [a, b] = await Promise.all([refresh(c1), refresh(c1)]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it('signing out with a cookie left behind by a cut-off rotation still ends the session', async () => {
    const { student } = await setup();
    const c1 = refreshCookie(await login())!;
    const c2 = refreshCookie(await refresh(c1))!;
    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', `sb_rt=${c1}`).set('X-SB-Client', '1').set('Origin', ORIGIN)).status).toBe(204);
    expect((await refresh(c2)).status).toBe(401);
    const s = await SessionModel.findOne({ institutionId: student.institutionId, userId: student._id }).lean();
    expect(s?.revokedReason).toBe('logout');
  });

  it('revokes the whole session when an old refresh token is reused (after the grace window)', async () => {
    const { student } = await setup();
    const c1 = refreshCookie(await login())!;
    const c2 = refreshCookie(await refresh(c1))!;
    await SessionModel.updateMany({ institutionId: student.institutionId, userId: student._id }, { $set: { rotatedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) } });
    const reuse = await refresh(c1);
    expect(reuse.status).toBe(401);
    expect(String(reuse.headers['set-cookie'])).toMatch(/sb_rt=;/); // cookie cleared
    expect((await refresh(c2)).status).toBe(401); // the legitimate token is dead too
    const s = await SessionModel.findOne({ institutionId: student.institutionId, userId: student._id }).lean();
    expect(s?.revokedReason).toBe('reuse_detected');
    expect(await AuditModel.countDocuments({ action: 'session.reuse_detected' })).toBe(1);
  });

  it('rejects a session past its 90-day hard limit', async () => {
    const { student } = await setup();
    const c1 = refreshCookie(await login())!;
    await SessionModel.updateMany({ institutionId: student.institutionId, userId: student._id }, { $set: { absoluteExpiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(c1)).status).toBe(401);
  });

  it('caps the sliding expiry at the absolute expiry', async () => {
    const { student } = await setup();
    const c1 = refreshCookie(await login())!;
    const cap = new Date(Date.now() + 60_000);
    await SessionModel.updateMany({ institutionId: student.institutionId, userId: student._id }, { $set: { absoluteExpiresAt: cap } });
    await refresh(c1);
    const s = await SessionModel.findOne({ institutionId: student.institutionId, userId: student._id }).lean();
    expect(s!.expiresAt.getTime()).toBeLessThanOrEqual(cap.getTime());
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session, clears the cookie and kills the access token', async () => {
    await setup();
    const res = await login();
    const cookie = refreshCookie(res)!;
    const out = await request(app).post('/api/v1/auth/logout').set({ 'X-SB-Client': '1', Origin: ORIGIN }).set('Cookie', `sb_rt=${cookie}`);
    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(/sb_rt=;/);
    expect((await refresh(cookie)).status).toBe(401);
    expect((await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${res.body.accessToken}`)).status).toBe(401);
  });
});

describe('one-time codes', () => {
  const otpReq = (body: object) => request(app).post('/api/v1/auth/otp/request').send({ purpose: 'login', consent: CONSENT, ...body });
  const otpVerify = (body: object) => request(app).post('/api/v1/auth/otp/verify').send({ consent: CONSENT, ...body });

  it('email: request -> 202, code delivered, verify -> signed in; a code works once', async () => {
    await setup();
    const r = await otpReq({ channel: 'email', identifier: 'arjun@example.com' });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ sent: true, resendAfter: 30 });
    const { code, to, purpose } = await nextCode();
    expect(to).toBe('arjun@example.com');
    expect(purpose).toBe('login');
    expect(code).toMatch(/^\d{4}$/);
    const v = await otpVerify({ channel: 'email', identifier: 'arjun@example.com', code });
    expect(v.status).toBe(200);
    expect(refreshCookie(v)).toBeDefined();
    expect((await otpVerify({ channel: 'email', identifier: 'arjun@example.com', code })).status).toBe(401);
  });

  it('sms: accepts the "98765 43210" format and normalises it to E.164', async () => {
    await setup();
    expect((await otpReq({ channel: 'sms', identifier: '98765 43210' })).status).toBe(202);
    const { code, to } = await nextCode();
    expect(to).toBe('+919876543210');
    expect((await otpVerify({ channel: 'sms', identifier: '9876543210', code })).status).toBe(200);
  });

  it('whatsapp: same flow through the console provider', async () => {
    await setup();
    expect((await otpReq({ channel: 'whatsapp', identifier: '9876543210' })).status).toBe(202);
    const { code } = await nextCode();
    expect((await otpVerify({ channel: 'whatsapp', identifier: '+919876543210', code })).status).toBe(200);
  });

  it('answers 202 for an unknown identifier but sends nothing, and no code can verify', async () => {
    await setup();
    const r = await otpReq({ channel: 'email', identifier: 'ghost@example.com' });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ sent: true, resendAfter: 30 });
    await new Promise((res) => setTimeout(res, 50));
    expect(testOutbox).toHaveLength(0);
    const v = await otpVerify({ channel: 'email', identifier: 'ghost@example.com', code: '0000' });
    expect(v.status).toBe(401);
    expect(v.body.error.message).toBe(GENERIC);
  });

  it('enforces the 30 s resend cooldown', async () => {
    await setup();
    expect((await otpReq({ channel: 'email', identifier: 'arjun@example.com' })).status).toBe(202);
    const again = await otpReq({ channel: 'email', identifier: 'arjun@example.com' });
    expect(again.status).toBe(429);
    expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('locks a code after 5 wrong attempts', async () => {
    await setup();
    await otpReq({ channel: 'email', identifier: 'arjun@example.com' });
    const { code } = await nextCode();
    const wrong = code === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) expect((await otpVerify({ channel: 'email', identifier: 'arjun@example.com', code: wrong })).status).toBe(401);
    expect((await otpVerify({ channel: 'email', identifier: 'arjun@example.com', code })).status).toBe(401);
  });

  it('requires consent and a 4-digit code', async () => {
    await setup();
    expect((await request(app).post('/api/v1/auth/otp/request').send({ channel: 'email', identifier: 'arjun@example.com', purpose: 'login' })).status).toBe(400);
    expect((await otpVerify({ channel: 'email', identifier: 'arjun@example.com', code: '12345' })).status).toBe(400);
    expect((await otpReq({ channel: 'sms', identifier: '12345' })).status).toBe(400);
  });
});

describe('passwords', () => {
  it('forgot -> reset: new password works, old one fails, existing sessions are revoked', async () => {
    const { student } = await setup();
    const oldCookie = refreshCookie(await login())!;
    expect((await request(app).post('/api/v1/auth/password/forgot').send({ email: 'arjun@example.com' })).status).toBe(202);
    const { code, purpose } = await nextCode();
    expect(purpose).toBe('reset_password');
    const reset = await request(app).post('/api/v1/auth/password/reset').send({ email: 'arjun@example.com', code, newPassword: 'NewPass@2026' });
    expect(reset.status).toBe(204);
    expect((await refresh(oldCookie)).status).toBe(401);
    expect((await login('arjun@example.com', 'Student@2026')).status).toBe(401);
    expect((await login('arjun@example.com', 'NewPass@2026')).status).toBe(200);
    expect(await AuditModel.countDocuments({ action: 'password.reset', actorId: student._id })).toBe(1);
  });

  it('reset refuses a new password that is the email or the phone, and the code still works afterwards', async () => {
    await setup();
    await request(app).post('/api/v1/auth/password/forgot').send({ email: 'arjun@example.com' });
    const { code } = await nextCode();
    const reset = (newPassword: string, c = code) => request(app).post('/api/v1/auth/password/reset').send({ email: 'arjun@example.com', code: c, newPassword });

    for (const same of ['Arjun@Example.com', '98765 43210', '+919876543210']) {
      const res = await reset(same);
      expect(res.status).toBe(400);
      expect(res.body.error.fields.newPassword).toBe('The password must not be the email or mobile number');
    }
    // A wrong code is a 401 even when the password is the phone: no way to test an email/phone pair without the code.
    expect((await reset('9876543210', code === '0000' ? '1111' : '0000')).status).toBe(401);
    // The refused requests did not use the code up.
    expect((await reset('NewPass@2026')).status).toBe(204);
    expect((await login('arjun@example.com', 'NewPass@2026')).status).toBe(200);
  });

  it('a sign-in code cannot be used to reset a password (purpose-bound)', async () => {
    await setup();
    await request(app).post('/api/v1/auth/otp/request').send({ channel: 'email', identifier: 'arjun@example.com', purpose: 'login', consent: CONSENT });
    const { code } = await nextCode();
    expect((await request(app).post('/api/v1/auth/password/reset').send({ email: 'arjun@example.com', code, newPassword: 'NewPass@2026' })).status).toBe(401);
  });

  it('change: needs the current password, keeps this session, revokes the others', async () => {
    await setup();
    const a = await login();
    const otherCookie = refreshCookie(await login())!;
    const auth = { Authorization: `Bearer ${a.body.accessToken}` };
    expect((await request(app).post('/api/v1/auth/password/change').set(auth).send({ currentPassword: 'nope', newPassword: 'NewPass@2026' })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/password/change').set(auth).send({ currentPassword: 'Student@2026', newPassword: 'Student@2026' })).status).toBe(400);
    for (const same of ['arjun@example.com', '98765 43210']) {
      const res = await request(app).post('/api/v1/auth/password/change').set(auth).send({ currentPassword: 'Student@2026', newPassword: same });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.newPassword).toBe('The password must not be the email or mobile number');
    }
    expect((await request(app).post('/api/v1/auth/password/change').set(auth).send({ currentPassword: 'Student@2026', newPassword: 'NewPass@2026' })).status).toBe(204);
    expect((await request(app).get('/api/v1/users/me').set(auth)).status).toBe(200);
    expect((await refresh(otherCookie)).status).toBe(401);
  });
});

describe('tenant isolation', () => {
  it('the tenantScope plugin refuses a user query without institutionId', async () => {
    await expect(UserModel.findOne({ email: 'arjun@example.com' })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(UserModel.countDocuments({})).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("a token from institution A cannot read a user of institution B (token's inst is authoritative)", async () => {
    const { student } = await setup();
    const instB = await makeInstitution('Other College');
    await makeUser(instB._id, { email: 'b@example.com' });
    const { body } = await login();
    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${body.accessToken}`);
    expect(me.body.id).toBe(String(student._id));
    expect(me.body.institution.id).toBe(String(student.institutionId));
  });
});

describe('app basics', () => {
  it('health/client shows the address the rate limits use, where it came from, and the proxy headers', async () => {
    const res = await request(app).get('/api/v1/health/client')
      .set('X-Forwarded-For', '203.0.113.7, 198.51.100.2').set('X-Real-IP', '203.0.113.8');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      forwardedFor: ['203.0.113.7', '198.51.100.2'], trustProxy: 0, clientIpHeader: null,
      ipFrom: 'proxy chain (TRUST_PROXY=0)', headers: { 'x-real-ip': '203.0.113.8', 'x-vercel-forwarded-for': null },
    });
    // TRUST_PROXY=0 and no CLIENT_IP_HEADER in tests: neither header is trusted.
    expect(res.body.ip).not.toBe('203.0.113.7');
    expect(res.body.ip).not.toBe('203.0.113.8');
  });

  it('health, JSON 404 and security headers', async () => {
    const h = await request(app).get('/api/v1/health');
    expect(h.status).toBe(200);
    expect(h.body.status).toBe('ok');
    expect(h.headers['x-content-type-options']).toBe('nosniff');
    expect(h.headers['x-powered-by']).toBeUndefined();
    expect(h.headers['x-request-id']).toEqual(expect.any(String));
    const nf = await request(app).get('/api/v1/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects oversized and malformed JSON bodies cleanly', async () => {
    const big = await request(app).post('/api/v1/auth/login').set('content-type', 'application/json').send(JSON.stringify({ email: 'x'.repeat(200_000) }));
    expect(big.status).toBe(413);
    const bad = await request(app).post('/api/v1/auth/login').set('content-type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
  });

  it('CORS allows only configured origins', async () => {
    const ok = await request(app).options('/api/v1/auth/login').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    const bad = await request(app).options('/api/v1/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
