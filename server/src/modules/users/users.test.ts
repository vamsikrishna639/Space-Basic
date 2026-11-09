import request from 'supertest';
import type { Express } from 'express';
import type { Types } from 'mongoose';
import type { Role } from '@spacebasic/shared';
import { createApp } from '../../app';
import { useTestDb } from '../../test/db';
import { CONSENT, makeInstitution, makeRoom, makeUser } from '../../test/factory';
import { AuditModel } from '../../core/audit/audit';
import { AssetModel } from '../assets/asset.model';
import { SessionModel } from '../auth/auth.models';
import { RoomModel } from '../hostel/hostel.models';
import { UserModel } from './user.model';

useTestDb();

let app: Express;
beforeEach(() => { app = createApp(); });

// 1x1 PNG, and the first bytes of a JPEG and a WebP file (format detection reads only the header).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(40, 2)]);

async function signIn(email: string, password = 'Password@123'): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, consent: CONSENT });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/** One institution with a room, one user per role, and tokens for each. */
async function world() {
  const inst = await makeInstitution();
  const room = await makeRoom(inst._id, 'CS240');
  const mk = (email: string, roles: Role[], fullName: string, roomId?: Types.ObjectId) => makeUser(inst._id, { email, roles, fullName, roomId });
  const student = await mk('student@example.com', ['student'], 'Arjun Rao', room._id);
  const warden = await mk('warden@example.com', ['warden'], 'Meera Nair');
  const admin = await mk('admin@example.com', ['institution_admin'], 'Rahul Verma');
  const superAdmin = await mk('super@example.com', ['super_admin'], 'Platform Staff');
  const token = {
    student: await signIn('student@example.com'),
    warden: await signIn('warden@example.com'),
    admin: await signIn('admin@example.com'),
    super: await signIn('super@example.com'),
  };
  return { inst, room, student, warden, admin, superAdmin, token };
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

// ---------------------------------------------------------------------------------------------------------
describe('avatar (own photo)', () => {
  it('upload -> /me shows the URL -> download with ETag -> 304 on revalidation', async () => {
    const { token } = await world();
    const put = await request(app).put('/api/v1/users/me/avatar').set(auth(token.student)).set('Content-Type', 'image/png').send(PNG);
    expect(put.status).toBe(200);
    expect(put.body.avatarUrl).toMatch(/^\/api\/v1\/users\/me\/avatar\?v=\d+$/);

    const me = await request(app).get('/api/v1/users/me').set(auth(token.student));
    expect(me.body.avatarUrl).toBe(put.body.avatarUrl);

    const get = await request(app).get('/api/v1/users/me/avatar').set(auth(token.student)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.headers['cache-control']).toBe('private, no-cache');
    expect(Buffer.compare(get.body as Buffer, PNG)).toBe(0);

    const again = await request(app).get('/api/v1/users/me/avatar').set(auth(token.student)).set('If-None-Match', get.headers.etag!);
    expect(again.status).toBe(304);
  });

  it('accepts JPEG and WebP, and replacing a photo leaves exactly one stored asset', async () => {
    const { token, student } = await world();
    for (const [type, bytes] of [['image/jpeg', JPEG], ['image/webp', WEBP], ['image/png', PNG]] as const) {
      const res = await request(app).put('/api/v1/users/me/avatar').set(auth(token.student)).set('Content-Type', type).send(bytes);
      expect(res.status).toBe(200);
    }
    expect(await AssetModel.countDocuments({ institutionId: student.institutionId, ownerId: student._id })).toBe(1);
  });

  it('rejects other types, bytes that do not match the declared type, empty and oversized uploads', async () => {
    const { token } = await world();
    const put = (type: string, body: Buffer | string) => request(app).put('/api/v1/users/me/avatar').set(auth(token.student)).set('Content-Type', type).send(body);
    expect((await put('image/gif', Buffer.from('GIF89a....'))).status).toBe(415);
    expect((await put('image/png', JPEG)).status).toBe(415); // declared PNG, really JPEG
    expect((await put('image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status).toBe(415);
    expect((await put('application/json', '{"a":1}')).status).toBe(415);
    expect((await put('image/png', Buffer.alloc(0))).status).toBe(415);
    const big = await put('image/png', Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('needs a signed-in user before reading any bytes, and 404 means "use the default avatar"', async () => {
    const { token } = await world();
    expect((await request(app).put('/api/v1/users/me/avatar').set('Content-Type', 'image/png').send(PNG)).status).toBe(401);
    expect((await request(app).get('/api/v1/users/me/avatar').set(auth(token.student))).status).toBe(404);
  });

  it('delete removes the photo and the stored bytes', async () => {
    const { token, student } = await world();
    await request(app).put('/api/v1/users/me/avatar').set(auth(token.student)).set('Content-Type', 'image/png').send(PNG);
    expect((await request(app).delete('/api/v1/users/me/avatar').set(auth(token.student))).status).toBe(204);
    expect((await request(app).get('/api/v1/users/me/avatar').set(auth(token.student))).status).toBe(404);
    expect((await request(app).get('/api/v1/users/me').set(auth(token.student))).body.avatarUrl).toBeNull();
    expect(await AssetModel.countDocuments({ institutionId: student.institutionId, ownerId: student._id })).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('GET /users (list)', () => {
  it('admin sees everyone in the institution except platform staff, sorted by name, with room display', async () => {
    const { token } = await world();
    const res = await request(app).get('/api/v1/users').set(auth(token.admin));
    expect(res.status).toBe(200);
    expect(res.body.items.map((u: { fullName: string }) => u.fullName)).toEqual(['Arjun Rao', 'Meera Nair', 'Rahul Verma']);
    const arjun = res.body.items[0];
    expect(arjun.room).toEqual({ code: 'CS240', display: 'West CS240' });
    expect(arjun).toMatchObject({ roles: ['student'], status: 'active', hasAvatar: false, hasPassword: true });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('super_admin also sees platform staff', async () => {
    const { token } = await world();
    const res = await request(app).get('/api/v1/users').set(auth(token.super));
    expect(res.body.items).toHaveLength(4);
  });

  it('a warden sees students only, and cannot ask for other roles', async () => {
    const { token } = await world();
    const res = await request(app).get('/api/v1/users').set(auth(token.warden));
    expect(res.status).toBe(200);
    expect(res.body.items.map((u: { fullName: string }) => u.fullName)).toEqual(['Arjun Rao']);
    expect((await request(app).get('/api/v1/users?role=warden').set(auth(token.warden))).status).toBe(403);
  });

  it('a student cannot list users', async () => {
    const { token } = await world();
    expect((await request(app).get('/api/v1/users').set(auth(token.student))).status).toBe(403);
  });

  it('filters by role, status and search text (name, email prefix, phone digits, room code)', async () => {
    const { token, inst, room } = await world();
    await makeUser(inst._id, { fullName: 'Kiran Das', email: 'kiran@example.com', phone: '+919811122233', roles: ['student'], status: 'disabled' });
    const q = async (qs: string) => (await request(app).get(`/api/v1/users?${qs}`).set(auth(token.admin))).body.items.map((u: { fullName: string }) => u.fullName);
    expect(await q('role=warden')).toEqual(['Meera Nair']);
    expect(await q('status=disabled')).toEqual(['Kiran Das']);
    expect(await q('q=meer')).toEqual(['Meera Nair']);
    expect(await q('q=rahul')).toEqual(['Rahul Verma']);
    expect(await q('q=98111')).toEqual(['Kiran Das']);
    expect(await q(`q=${room.code.toLowerCase()}`)).toEqual(['Arjun Rao']);
    expect(await q('q=.*')).toEqual([]); // regex characters are literal
  });

  it('pages with an opaque cursor and rejects a forged one', async () => {
    const { token, inst } = await world();
    for (let i = 0; i < 5; i++) await makeUser(inst._id, { fullName: `Student ${i}`, roles: ['student'] });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await request(app).get(`/api/v1/users?limit=3${cursor ? `&cursor=${cursor}` : ''}`).set(auth(token.admin));
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((u: { fullName: string }) => u.fullName));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
    expect((await request(app).get('/api/v1/users?cursor=not-a-cursor').set(auth(token.admin))).status).toBe(400);
    expect((await request(app).get('/api/v1/users?limit=500').set(auth(token.admin))).status).toBe(400);
  });

  it('never lists users of another institution', async () => {
    const { token } = await world();
    const other = await makeInstitution('Other University');
    await makeUser(other._id, { fullName: 'Aaron Other', roles: ['student'] });
    const names = (await request(app).get('/api/v1/users?q=aaron').set(auth(token.admin))).body.items;
    expect(names).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('POST /users (create)', () => {
  it('creates a student in a room, audits it, and the new user can sign in', async () => {
    const { token, admin } = await world();
    const res = await request(app).post('/api/v1/users').set(auth(token.admin)).send({
      fullName: '  Priya   Sharma ', email: 'Priya@Example.com', phone: '90000 00011', roles: ['student'], roomCode: 'cs240', password: 'Priya@2026x',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ fullName: 'Priya Sharma', email: 'priya@example.com', phone: '+919000000011', room: { display: 'West CS240' }, hasPassword: true });
    expect(await AuditModel.exists({ action: 'user.create', actorId: admin._id, targetId: res.body.id })).toBeTruthy();
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'priya@example.com', password: 'Priya@2026x', consent: CONSENT })).status).toBe(200);
  });

  it('validates input: email or phone, room only for students, room must exist, password not the email', async () => {
    const { token } = await world();
    const post = (body: object) => request(app).post('/api/v1/users').set(auth(token.admin)).send(body);
    let res = await post({ fullName: 'No Contact', roles: ['student'] });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.email).toBeDefined();
    res = await post({ fullName: 'Warden Room', email: 'w2@example.com', roles: ['warden'], roomCode: 'CS240' });
    expect(res.body.error.fields.roomCode).toBe('Only students have a room');
    res = await post({ fullName: 'Lost Student', email: 'lost@example.com', roles: ['student'], roomCode: 'CS299' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.roomCode).toBe('There is no room CS299');
    res = await post({ fullName: 'Same Pass', email: 'samepass@example.com', roles: ['student'], password: 'samepass@example.com' });
    expect(res.body.error.fields.password).toBeDefined();
    res = await post({ fullName: 'Phone Pass', phone: '+919811122233', roles: ['student'], password: '98111 22233' });
    expect(res.body.error.fields.password).toBe('The password must not be the email or mobile number');
    res = await post({ fullName: 'Mess Person', email: 'mess@example.com', roles: ['mess_staff'] });
    expect(res.status).toBe(400); // not assignable until the Mess module exists
  });

  it('409 for an email or phone used anywhere, even in another institution', async () => {
    const { token } = await world();
    const other = await makeInstitution('Other University');
    await makeUser(other._id, { email: 'taken@example.com', phone: '+919000000099' });
    const res = await request(app).post('/api/v1/users').set(auth(token.admin)).send({ fullName: 'Dup', email: 'taken@example.com', phone: '9000000099', roles: ['student'] });
    expect(res.status).toBe(409);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'phone']);
  });

  it('409 when the room has no free bed', async () => {
    const { token, inst, room } = await world(); // CS240 has 3 beds; the student from world() uses one
    await makeUser(inst._id, { roles: ['student'], roomId: room._id });
    await makeUser(inst._id, { roles: ['student'], roomId: room._id });
    const res = await request(app).post('/api/v1/users').set(auth(token.admin)).send({ fullName: 'Fourth', email: 'fourth@example.com', roles: ['student'], roomCode: 'CS240' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.roomCode).toMatch(/full/);
  });

  it('only super_admin can grant super_admin; wardens and students cannot create users', async () => {
    const { token } = await world();
    const body = { fullName: 'New Staff', email: 'staff@example.com', roles: ['super_admin'] };
    expect((await request(app).post('/api/v1/users').set(auth(token.admin)).send(body)).status).toBe(403);
    expect((await request(app).post('/api/v1/users').set(auth(token.super)).send(body)).status).toBe(201);
    const s = { fullName: 'Someone', email: 'someone@example.com', roles: ['student'] };
    expect((await request(app).post('/api/v1/users').set(auth(token.warden)).send(s)).status).toBe(403);
    expect((await request(app).post('/api/v1/users').set(auth(token.student)).send(s)).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('POST /users/import', () => {
  it('creates the valid rows and reports each skipped row with its reason', async () => {
    const { token, admin } = await world();
    const res = await request(app).post('/api/v1/users/import').set(auth(token.admin)).send({
      users: [
        { fullName: 'Row One', email: 'one@example.com', roles: ['student'], roomCode: 'CS240', phone: '', password: '' },
        { fullName: 'Row Two', roles: ['student'] },
        { fullName: 'Row Three', email: 'one@example.com', roles: ['student'] },
        { fullName: 'Row Four', email: 'four@example.com', roles: ['super_admin'] },
        { fullName: 'Row Five', email: 'five@example.com', roles: ['student'], roomCode: 'CS240' },
        { fullName: 'Row Six', phone: '90000 00066', roles: ['warden', 'student'] },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(3);
    expect(res.body.skipped.map((s: { row: number }) => s.row)).toEqual([2, 3, 4]);
    expect(res.body.skipped[0].reason).toMatch(/^email: /);
    expect(res.body.skipped[1].reason).toMatch(/already in use/);
    expect(res.body.skipped[2].reason).toMatch(/super_admin/);
    expect(await AuditModel.exists({ action: 'user.import', actorId: admin._id })).toBeTruthy();
  });

  it('skips the row that would overfill a room (rows see earlier rows)', async () => {
    const { token } = await world(); // CS240: 1 of 3 beds taken
    const rows = [1, 2, 3].map((n) => ({ fullName: `Bed ${n}`, email: `bed${n}@example.com`, roles: ['student'], roomCode: 'CS240' }));
    const res = await request(app).post('/api/v1/users/import').set(auth(token.admin)).send({ users: rows });
    expect(res.body.created).toBe(2);
    expect(res.body.skipped).toEqual([{ row: 3, reason: expect.stringMatching(/roomCode: Room CS240 is full/) }]);
  });

  it('limits a request to 500 rows and needs users:import', async () => {
    const { token } = await world();
    const rows = Array.from({ length: 501 }, (_, i) => ({ fullName: `U ${i}`, email: `u${i}@example.com`, roles: ['student'] }));
    expect((await request(app).post('/api/v1/users/import').set(auth(token.admin)).send({ users: rows })).status).toBe(400);
    expect((await request(app).post('/api/v1/users/import').set(auth(token.warden)).send({ users: rows.slice(0, 1) })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('PATCH /users/:id', () => {
  it('updates fields, moves rooms, and audits the field names (not the values)', async () => {
    const { token, student, inst } = await world();
    await makeRoom(inst._id, 'CS241');
    const res = await request(app).patch(`/api/v1/users/${student._id}`).set(auth(token.admin)).send({ fullName: 'Arjun K Rao', phone: '9000000077', roomCode: 'CS241' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fullName: 'Arjun K Rao', phone: '+919000000077', room: { code: 'CS241' } });
    const entry = await AuditModel.findOne({ action: 'user.update', targetId: student._id }).lean();
    expect(entry?.meta).toEqual({ fields: ['fullName', 'phone', 'room'] });
    const cleared = await request(app).patch(`/api/v1/users/${student._id}`).set(auth(token.admin)).send({ roomCode: null });
    expect(cleared.body.room).toBeNull();
  });

  it('keeps at least one of email / phone', async () => {
    const { token, student } = await world();
    const res = await request(app).patch(`/api/v1/users/${student._id}`).set(auth(token.admin)).send({ email: null });
    expect(res.status).toBe(400);
  });

  it('disabling revokes every session at once; the user cannot sign in again until enabled', async () => {
    const { token, student } = await world();
    const res = await request(app).patch(`/api/v1/users/${student._id}`).set(auth(token.admin)).send({ status: 'disabled' });
    expect(res.status).toBe(200);
    expect(await SessionModel.countDocuments({ institutionId: student.institutionId, userId: student._id, revokedAt: null })).toBe(0);
    expect((await request(app).get('/api/v1/users/me').set(auth(token.student))).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'student@example.com', password: 'Password@123', consent: CONSENT })).status).toBe(401);
    expect(await AuditModel.exists({ action: 'user.disable', targetId: student._id })).toBeTruthy();
    await request(app).patch(`/api/v1/users/${student._id}`).set(auth(token.admin)).send({ status: 'active' });
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'student@example.com', password: 'Password@123', consent: CONSENT })).status).toBe(200);
  });

  it('an admin cannot disable themself or edit platform staff; another institution\'s user is 404', async () => {
    const { token, admin, superAdmin } = await world();
    expect((await request(app).patch(`/api/v1/users/${admin._id}`).set(auth(token.admin)).send({ status: 'disabled' })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/users/${superAdmin._id}`).set(auth(token.admin)).send({ fullName: 'Changed' })).status).toBe(403);
    const other = await makeInstitution('Other University');
    const outsider = await makeUser(other._id, { roles: ['student'] });
    expect((await request(app).patch(`/api/v1/users/${outsider._id}`).set(auth(token.admin)).send({ fullName: 'Hijack' })).status).toBe(404);
    expect((await UserModel.findOne({ _id: outsider._id, institutionId: other._id }).lean())?.fullName).not.toBe('Hijack');
    expect((await request(app).patch('/api/v1/users/not-an-id').set(auth(token.admin)).send({ fullName: 'X Y' })).status).toBe(400);
  });

  it('a warden cannot update users', async () => {
    const { token, student } = await world();
    expect((await request(app).patch(`/api/v1/users/${student._id}`).set(auth(token.warden)).send({ fullName: 'Changed' })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('PATCH /users/:id/roles', () => {
  it('changes roles immediately, audits from/to, and a non-student leaves their room', async () => {
    const { token, student } = await world();
    const res = await request(app).patch(`/api/v1/users/${student._id}/roles`).set(auth(token.admin)).send({ roles: ['warden'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ roles: ['warden'], room: null });
    const entry = await AuditModel.findOne({ action: 'user.role_change', targetId: student._id }).lean();
    expect(entry?.meta).toMatchObject({ from: ['student'], to: ['warden'], leftRoom: true });
    // The same access token now has warden permissions (roles are read per request).
    expect((await request(app).get('/api/v1/users').set(auth(token.student))).status).toBe(200);
  });

  it('refuses super_admin grants by admins, changing your own roles, and empty role lists', async () => {
    const { token, student, admin } = await world();
    expect((await request(app).patch(`/api/v1/users/${student._id}/roles`).set(auth(token.admin)).send({ roles: ['super_admin'] })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/users/${admin._id}/roles`).set(auth(token.admin)).send({ roles: ['student'] })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/users/${student._id}/roles`).set(auth(token.admin)).send({ roles: [] })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/users/${student._id}/roles`).set(auth(token.super)).send({ roles: ['super_admin'] })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Admin Users screens (2026-11-09): one user, the "waiting for a room" list, and beds that can't be overfilled.

describe('GET /users/:id', () => {
  it('admins read any user they can list; platform staff, other institutions and bad ids are 404 / 400', async () => {
    const { token, student, warden, superAdmin } = await world();
    const res = await request(app).get(`/api/v1/users/${student._id}`).set(auth(token.admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: String(student._id), fullName: 'Arjun Rao', roles: ['student'], room: { code: 'CS240', display: 'West CS240' }, hasPassword: true });
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect((await request(app).get(`/api/v1/users/${warden._id}`).set(auth(token.admin))).status).toBe(200);
    expect((await request(app).get(`/api/v1/users/${superAdmin._id}`).set(auth(token.admin))).status).toBe(404);
    expect((await request(app).get(`/api/v1/users/${superAdmin._id}`).set(auth(token.super))).status).toBe(200);
    const other = await makeInstitution('Other University');
    const outsider = await makeUser(other._id, { roles: ['student'] });
    expect((await request(app).get(`/api/v1/users/${outsider._id}`).set(auth(token.admin))).status).toBe(404);
    expect((await request(app).get('/api/v1/users/not-an-id').set(auth(token.admin))).status).toBe(400);
  });

  it('wardens read students only; students cannot read users', async () => {
    const { token, student, admin } = await world();
    expect((await request(app).get(`/api/v1/users/${student._id}`).set(auth(token.warden))).status).toBe(200);
    expect((await request(app).get(`/api/v1/users/${admin._id}`).set(auth(token.warden))).status).toBe(404);
    expect((await request(app).get(`/api/v1/users/${student._id}`).set(auth(token.student))).status).toBe(403);
  });
});

describe('GET /users?room=', () => {
  it('room=none lists the students waiting for a room; room=assigned the ones with one', async () => {
    const { token, inst } = await world();
    await makeUser(inst._id, { roles: ['student'], fullName: 'Bina Waiting' });
    await makeUser(inst._id, { roles: ['student'], fullName: 'Chetan Waiting', status: 'disabled' });
    const waiting = await request(app).get('/api/v1/users?role=student&room=none').set(auth(token.admin));
    expect(waiting.status).toBe(200);
    expect(waiting.body.items.map((u: { fullName: string }) => u.fullName)).toEqual(['Bina Waiting', 'Chetan Waiting']);
    const activeWaiting = await request(app).get('/api/v1/users?role=student&room=none&status=active').set(auth(token.admin));
    expect(activeWaiting.body.items.map((u: { fullName: string }) => u.fullName)).toEqual(['Bina Waiting']);
    const housed = await request(app).get('/api/v1/users?room=assigned').set(auth(token.admin));
    expect(housed.body.items.map((u: { fullName: string }) => u.fullName)).toEqual(['Arjun Rao']);
    expect((await request(app).get('/api/v1/users?room=maybe').set(auth(token.admin))).status).toBe(400);
  });
});

describe('beds are enforced on the server, even under races', () => {
  /** world() plus room CT301 with `free` of its 3 beds free, and `n` students without a room. */
  async function crowd(free: number, n: number) {
    const w = await world();
    const room = await makeRoom(w.inst._id, 'CT301');
    for (let i = 0; i < 3 - free; i++) await makeUser(w.inst._id, { roles: ['student'], roomId: room._id });
    const waiting = [];
    for (let i = 0; i < n; i++) waiting.push(await makeUser(w.inst._id, { roles: ['student'], fullName: `Waiting ${i}` }));
    const occupants = () => UserModel.countDocuments({ institutionId: w.inst._id, roomId: room._id, status: 'active' });
    return { ...w, room, waiting, occupants };
  }

  it('eight admins assigning the last bed at once: exactly one wins, the rest get 409 and keep no room', async () => {
    const { token, waiting, occupants, inst } = await crowd(1, 8);
    const results = await Promise.all(waiting.map((u) => request(app).patch(`/api/v1/users/${u._id}`).set(auth(token.admin)).send({ roomCode: 'CT301' })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect(results.filter((r) => r.status === 409).every((r) => /CT301/.test(r.body.error.fields.roomCode as string))).toBe(true);
    expect(await occupants()).toBe(3);
    expect(await UserModel.countDocuments({ institutionId: inst._id, fullName: /^Waiting/, roomId: { $ne: null } })).toBe(1);
  });

  it('creating users into the last two beds at once never overfills the room, and refused creates leave nothing', async () => {
    const { token, occupants, inst } = await crowd(2, 0);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      request(app).post('/api/v1/users').set(auth(token.admin)).send({ fullName: `New Student ${i}`, email: `new${i}@example.com`, roles: ['student'], roomCode: 'CT301' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await occupants()).toBe(3);
    expect(await UserModel.countDocuments({ institutionId: inst._id, email: /^new\d@/ })).toBe(2);
  });

  it('shrinking a room while students are assigned to it never ends over capacity', async () => {
    const { token, waiting, occupants, room, inst } = await crowd(2, 2);
    const results = await Promise.all([
      request(app).patch(`/api/v1/users/${waiting[0]!._id}`).set(auth(token.admin)).send({ roomCode: 'CT301' }),
      request(app).patch(`/api/v1/users/${waiting[1]!._id}`).set(auth(token.admin)).send({ roomCode: 'CT301' }),
      request(app).patch('/api/v1/hostel/rooms/CT301').set(auth(token.admin)).send({ beds: 1 }),
    ]);
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    const beds = (await RoomModel.findOne({ institutionId: inst._id, _id: room._id }).lean())!.beds;
    expect(await occupants()).toBeLessThanOrEqual(beds);
  });

  it('a disabled student keeps the room but not the bed; enabling them again needs a free bed', async () => {
    const { token, inst, room, occupants } = await crowd(1, 0);
    const holder = await makeUser(inst._id, { roles: ['student'], roomId: room._id, fullName: 'Dev Holder' });
    expect(await occupants()).toBe(3);
    expect((await request(app).patch(`/api/v1/users/${holder._id}`).set(auth(token.admin)).send({ status: 'disabled' })).status).toBe(200);
    const newcomer = await makeUser(inst._id, { roles: ['student'], fullName: 'Esha Newcomer' });
    expect((await request(app).patch(`/api/v1/users/${newcomer._id}`).set(auth(token.admin)).send({ roomCode: 'CT301' })).status).toBe(200);

    const back = await request(app).patch(`/api/v1/users/${holder._id}`).set(auth(token.admin)).send({ status: 'active' });
    expect(back.status).toBe(409);
    expect(back.body.error.fields.roomCode).toMatch(/CT301 is full/);
    expect((await UserModel.findOne({ institutionId: inst._id, _id: holder._id }).lean())!.status).toBe('disabled');

    await makeRoom(inst._id, 'CT302');
    const moved = await request(app).patch(`/api/v1/users/${holder._id}`).set(auth(token.admin)).send({ status: 'active', roomCode: 'CT302' });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ status: 'active', room: { code: 'CT302' } });
    expect(await occupants()).toBe(3);
    const entry = await AuditModel.findOne({ action: 'user.update', targetId: holder._id }).sort({ _id: -1 }).lean();
    expect(entry?.meta).toEqual({ fields: ['status', 'room'] });
  });

  it('"moving" a student to the room they are already in is not "full" and changes nothing', async () => {
    const { token, student, inst, room } = await world();
    await makeUser(inst._id, { roles: ['student'], roomId: room._id });
    await makeUser(inst._id, { roles: ['student'], roomId: room._id });
    const res = await request(app).patch(`/api/v1/users/${student._id}`).set(auth(token.admin)).send({ roomCode: 'CS240' });
    expect(res.status).toBe(200);
    expect(await AuditModel.exists({ action: 'user.update', targetId: student._id })).toBeNull();
  });
});
