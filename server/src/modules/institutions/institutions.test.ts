import fs from 'node:fs';
import request from 'supertest';
import type { Express } from 'express';
import type { Types } from 'mongoose';
import { type Role } from '@spacebasic/shared';
import { createApp } from '../../app';
import { useTestDb } from '../../test/db';
import { CONSENT, makeInstitution, makeUser } from '../../test/factory';
import { AuditModel } from '../../core/audit/audit';
import { AssetModel } from '../assets/asset.model';
import { DEV_LOGO_FILE, seedDevData, seedDevLogo } from '../../scripts/seed-data';
import { InstitutionModel } from './institution.model';

useTestDb();

let app: Express;
beforeEach(() => { app = createApp(); });

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
let seq = 0;

async function signIn(institutionId: Types.ObjectId, role: Role = 'student') {
  const email = `${role}${++seq}@example.com`;
  await makeUser(institutionId, { email, roles: [role] });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123', consent: CONSENT });
  return res.body.accessToken as string;
}

describe('institution logo', () => {
  it('an admin uploads it; /users/me links it; anyone can fetch it with an ETag', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    const up = await request(app).put('/api/v1/institutions/current/logo').set(auth(admin)).set('Content-Type', 'image/png').send(PNG);
    expect(up.status).toBe(200);
    expect(up.body.logoUrl).toMatch(new RegExp(`^/api/v1/institutions/${inst._id}/logo\\?v=\\d+$`));
    expect(await AuditModel.countDocuments({ institutionId: inst._id, action: 'institution.logo_update' })).toBe(1);

    const me = await request(app).get('/api/v1/users/me').set(auth(admin));
    expect(me.body.institution.logoUrl).toBe(up.body.logoUrl);

    const got = await request(app).get(up.body.logoUrl); // no token: public
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['cache-control']).toBe('public, max-age=86400');
    expect(Buffer.compare(got.body as Buffer, PNG)).toBe(0);
    const again = await request(app).get(up.body.logoUrl).set('If-None-Match', got.headers.etag!);
    expect(again.status).toBe(304);
  });

  it('replacing the logo keeps one stored file', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    for (let i = 0; i < 2; i++) await request(app).put('/api/v1/institutions/current/logo').set(auth(admin)).set('Content-Type', 'image/png').send(PNG);
    expect(await AssetModel.countDocuments({ institutionId: inst._id, kind: 'institution_logo' })).toBe(1);
  });

  it('students and wardens cannot upload; wrong bytes are 415; no logo is 404', async () => {
    const inst = await makeInstitution();
    for (const role of ['student', 'warden'] as const) {
      const t = await signIn(inst._id, role);
      expect((await request(app).put('/api/v1/institutions/current/logo').set(auth(t)).set('Content-Type', 'image/png').send(PNG)).status).toBe(403);
    }
    const admin = await signIn(inst._id, 'institution_admin');
    expect((await request(app).put('/api/v1/institutions/current/logo').set(auth(admin)).set('Content-Type', 'image/png').send(Buffer.from('not an image'))).status).toBe(415);
    expect((await request(app).get(`/api/v1/institutions/${inst._id}/logo`)).status).toBe(404);
    expect((await request(app).get('/api/v1/institutions/not-an-id/logo')).status).toBe(400);
    expect((await request(app).put('/api/v1/institutions/current/logo').set('Content-Type', 'image/png').send(PNG)).status).toBe(401);
  });

  it("an admin only ever changes their own institution's logo", async () => {
    const a = await makeInstitution('A University');
    const b = await makeInstitution('B University');
    const adminA = await signIn(a._id, 'institution_admin');
    await request(app).put('/api/v1/institutions/current/logo').set(auth(adminA)).set('Content-Type', 'image/png').send(PNG);
    expect((await InstitutionModel.findById(a._id).lean())!.logo).not.toBeNull();
    expect((await InstitutionModel.findById(b._id).lean())!.logo).toBeNull();
  });
});

describe('dev seed', () => {
  it('uploads the supplied Presidency logo once', async () => {
    await seedDevData();
    const inst = await InstitutionModel.findOne({ slug: 'presidency-university' }).lean();
    expect(inst!.logo).not.toBeNull();
    const got = await request(app).get(`/api/v1/institutions/${inst!._id}/logo`);
    expect(got.status).toBe(200);
    expect(Buffer.compare(got.body as Buffer, fs.readFileSync(DEV_LOGO_FILE))).toBe(0);
    expect(await seedDevLogo(inst!._id)).toBe(false);
  });
});
