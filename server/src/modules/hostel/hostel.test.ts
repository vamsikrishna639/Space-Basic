import request from 'supertest';
import type { Express } from 'express';
import type { Role } from '@spacebasic/shared';
import { createApp } from '../../app';
import { useTestDb } from '../../test/db';
import { CONSENT, makeInstitution, makeUser } from '../../test/factory';
import { AuditModel } from '../../core/audit/audit';
import { RoomModel } from './hostel.models';

useTestDb();

let app: Express;
beforeEach(() => { app = createApp(); });

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function signIn(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123', consent: CONSENT });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function institution(name = 'Test University', prefix = '') {
  const inst = await makeInstitution(name);
  const mk = async (role: Role) => {
    const email = `${prefix}${role}@example.com`;
    await makeUser(inst._id, { email, roles: [role] });
    return signIn(email);
  };
  return { inst, token: { student: await mk('student'), warden: await mk('warden'), admin: await mk('institution_admin') } };
}

/** Admin builds block W with two small floors through the API. */
async function layout(admin: string) {
  const post = (path: string, body: object) => request(app).post(`/api/v1/hostel${path}`).set(auth(admin)).send(body);
  expect((await post('/hostels', { name: 'West', code: 'w' })).status).toBe(201);
  expect((await post('/floors', { hostelCode: 'W', code: 'CF', name: 'First floor', roomNumberMin: 101, roomNumberMax: 104 })).status).toBe(201);
  expect((await post('/floors', { hostelCode: 'W', code: 'CS', name: 'Second floor', roomNumberMin: 201, roomNumberMax: 202, bedsPerRoom: 2 })).status).toBe(201);
  expect((await post('/floors/CF/rooms/generate', { hostelCode: 'W' })).body).toEqual({ created: 4 });
  expect((await post('/floors/cs/rooms/generate', { hostelCode: 'W' })).body).toEqual({ created: 2 });
}

describe('GET /hostel/structure', () => {
  it('shows hostels and floors in order with room counts, for wardens and admins', async () => {
    const { token } = await institution();
    await layout(token.admin);
    for (const t of [token.admin, token.warden]) {
      const res = await request(app).get('/api/v1/hostel/structure').set(auth(t));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{
        hostel: { name: 'West', code: 'W', order: 1 },
        floors: [
          { code: 'CF', name: 'First floor', order: 1, roomNumberMin: 101, roomNumberMax: 104, bedsPerRoom: 3, roomCount: 4 },
          { code: 'CS', name: 'Second floor', order: 2, roomNumberMin: 201, roomNumberMax: 202, bedsPerRoom: 2, roomCount: 2 },
        ],
      }]);
    }
  });

  it('students and signed-out callers have no access (their own room comes with /users/me)', async () => {
    const { token } = await institution();
    expect((await request(app).get('/api/v1/hostel/structure').set(auth(token.student))).status).toBe(403);
    expect((await request(app).get('/api/v1/hostel/structure')).status).toBe(401);
  });

  it("never shows another institution's layout", async () => {
    const a = await institution('A University', 'a-');
    const b = await institution('B University', 'b-');
    await layout(a.token.admin);
    expect((await request(app).get('/api/v1/hostel/structure').set(auth(b.token.admin))).body).toEqual([]);
  });
});

describe('creating the layout', () => {
  it('hostel codes are upper-cased, validated and unique; audited', async () => {
    const { token } = await institution();
    const post = (body: object) => request(app).post('/api/v1/hostel/hostels').set(auth(token.admin)).send(body);
    const res = await post({ name: 'East', code: 'e1' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: 'East', code: 'E1', order: 1 });
    expect((await post({ name: 'East again', code: 'E1' })).status).toBe(409);
    expect((await post({ name: 'Bad', code: 'TOO-LONG' })).status).toBe(400);
    expect(await AuditModel.exists({ action: 'hostel.create' })).toBeTruthy();
  });

  it('floors: hostel must exist, range must be valid, and the code is unique across the institution', async () => {
    const { token } = await institution();
    await layout(token.admin);
    await request(app).post('/api/v1/hostel/hostels').set(auth(token.admin)).send({ name: 'East', code: 'E' });
    const post = (body: object) => request(app).post('/api/v1/hostel/floors').set(auth(token.admin)).send(body);
    expect((await post({ hostelCode: 'X', code: 'CT', name: 'Third', roomNumberMin: 301, roomNumberMax: 310 })).status).toBe(404);
    const backwards = await post({ hostelCode: 'W', code: 'CT', name: 'Third', roomNumberMin: 310, roomNumberMax: 301 });
    expect(backwards.status).toBe(400);
    expect(backwards.body.error.fields.roomNumberMax).toBeDefined();
    expect((await post({ hostelCode: 'W', code: 'C1', name: 'Bad', roomNumberMin: 1, roomNumberMax: 2 })).status).toBe(400);
    expect((await post({ hostelCode: 'W', code: 'CT', name: 'Third', roomNumberMin: 301, roomNumberMax: 310, bedsPerRoom: 13 })).status).toBe(400);
    // "CS" already exists in hostel W: a second "CS" in hostel E would make room codes like CS201 ambiguous.
    const dup = await post({ hostelCode: 'E', code: 'CS', name: 'Second', roomNumberMin: 201, roomNumberMax: 210 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.fields.code).toMatch(/institution/);
  });

  it('generating rooms is idempotent and fills only the missing numbers', async () => {
    const { token, inst } = await institution();
    await layout(token.admin);
    const gen = () => request(app).post('/api/v1/hostel/floors/CF/rooms/generate').set(auth(token.admin)).send({ hostelCode: 'W' });
    expect((await gen()).body).toEqual({ created: 0 });
    await RoomModel.deleteOne({ institutionId: inst._id, code: 'CF102' });
    expect((await gen()).body).toEqual({ created: 1 });
    const rooms = await RoomModel.find({ institutionId: inst._id }).sort({ code: 1 }).lean();
    expect(rooms.map((r) => `${r.code}:${r.beds}`)).toEqual(['CF101:3', 'CF102:3', 'CF103:3', 'CF104:3', 'CS201:2', 'CS202:2']);
    expect(await AuditModel.countDocuments({ action: 'rooms.generate' })).toBe(3); // the two in layout() + the refill
  });

  it('generate needs the floor in that hostel', async () => {
    const { token } = await institution();
    await layout(token.admin);
    await request(app).post('/api/v1/hostel/hostels').set(auth(token.admin)).send({ name: 'East', code: 'E' });
    expect((await request(app).post('/api/v1/hostel/floors/CF/rooms/generate').set(auth(token.admin)).send({ hostelCode: 'E' })).status).toBe(404);
    expect((await request(app).post('/api/v1/hostel/floors/ZZ/rooms/generate').set(auth(token.admin)).send({ hostelCode: 'W' })).status).toBe(404);
  });

  it('wardens and students cannot change the layout', async () => {
    const { token } = await institution();
    for (const t of [token.warden, token.student]) {
      expect((await request(app).post('/api/v1/hostel/hostels').set(auth(t)).send({ name: 'East', code: 'E' })).status).toBe(403);
    }
  });
});

describe('GET /hostel/rooms', () => {
  it('lists rooms with occupancy, filters by floor and pages by code', async () => {
    const { token, inst } = await institution();
    await layout(token.admin);
    const cf101 = await RoomModel.findOne({ institutionId: inst._id, code: 'CF101' }).lean();
    await makeUser(inst._id, { roles: ['student'], roomId: cf101!._id });
    await makeUser(inst._id, { roles: ['student'], roomId: cf101!._id });
    await makeUser(inst._id, { roles: ['student'], roomId: cf101!._id, status: 'disabled' }); // not counted

    const first = await request(app).get('/api/v1/hostel/rooms?floor=cf&limit=3').set(auth(token.warden));
    expect(first.status).toBe(200);
    expect(first.body.items[0]).toEqual({ code: 'CF101', number: 101, floorCode: 'CF', hostelCode: 'W', beds: 3, occupants: 2 });
    expect(first.body.items.map((r: { code: string }) => r.code)).toEqual(['CF101', 'CF102', 'CF103']);
    const second = await request(app).get(`/api/v1/hostel/rooms?floor=CF&limit=3&cursor=${first.body.nextCursor}`).set(auth(token.warden));
    expect(second.body).toEqual({ items: [expect.objectContaining({ code: 'CF104', occupants: 0 })], nextCursor: null });

    const all = await request(app).get('/api/v1/hostel/rooms?hostel=W').set(auth(token.admin));
    expect(all.body.items).toHaveLength(6);
  });

  it('unknown floor or hostel is 404; a forged cursor is 400', async () => {
    const { token } = await institution();
    await layout(token.admin);
    expect((await request(app).get('/api/v1/hostel/rooms?floor=ZZ').set(auth(token.admin))).status).toBe(404);
    expect((await request(app).get('/api/v1/hostel/rooms?hostel=Q').set(auth(token.admin))).status).toBe(404);
    expect((await request(app).get('/api/v1/hostel/rooms?cursor=abc').set(auth(token.admin))).status).toBe(400);
  });
});

describe('PATCH /hostel/rooms/:code', () => {
  it('changes the bed count (audited) but never below the current occupants', async () => {
    const { token, inst } = await institution();
    await layout(token.admin);
    const room = await RoomModel.findOne({ institutionId: inst._id, code: 'CS201' }).lean();
    await makeUser(inst._id, { roles: ['student'], roomId: room!._id });
    await makeUser(inst._id, { roles: ['student'], roomId: room!._id });

    const up = await request(app).patch('/api/v1/hostel/rooms/cs201').set(auth(token.admin)).send({ beds: 4 });
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ code: 'CS201', beds: 4, occupants: 2 });
    expect((await AuditModel.findOne({ action: 'room.update' }).lean())?.meta).toEqual({ code: 'CS201', beds: { from: 2, to: 4 } });

    const down = await request(app).patch('/api/v1/hostel/rooms/CS201').set(auth(token.admin)).send({ beds: 1 });
    expect(down.status).toBe(409);
    expect(down.body.error.fields.beds).toMatch(/2 occupants/);
    expect((await request(app).patch('/api/v1/hostel/rooms/CS201').set(auth(token.admin)).send({ beds: 0 })).status).toBe(400);
  });

  it("another institution's room is 404 and stays unchanged; wardens cannot edit", async () => {
    const a = await institution('A University', 'a-');
    const b = await institution('B University', 'b-');
    await layout(a.token.admin);
    expect((await request(app).patch('/api/v1/hostel/rooms/CF101').set(auth(b.token.admin)).send({ beds: 9 })).status).toBe(404);
    expect((await RoomModel.findOne({ institutionId: a.inst._id, code: 'CF101' }).lean())?.beds).toBe(3);
    expect((await request(app).patch('/api/v1/hostel/rooms/CF101').set(auth(a.token.warden)).send({ beds: 4 })).status).toBe(403);
  });
});

describe('GET /hostel/rooms (the admin room picker)', () => {
  it('free=true lists only rooms with a free bed (a disabled user holds none); q matches the start of the code', async () => {
    const { token, inst } = await institution();
    await layout(token.admin);
    const room = async (code: string) => (await RoomModel.findOne({ institutionId: inst._id, code }).lean())!._id;
    for (let i = 0; i < 3; i++) await makeUser(inst._id, { roles: ['student'], roomId: await room('CF101') }); // full
    for (let i = 0; i < 2; i++) await makeUser(inst._id, { roles: ['student'], roomId: await room('CF102') });
    await makeUser(inst._id, { roles: ['student'], roomId: await room('CF102'), status: 'disabled' });
    await makeUser(inst._id, { roles: ['student'], roomId: await room('CF103') });

    const first = await request(app).get('/api/v1/hostel/rooms?free=true&q=cf10&limit=2').set(auth(token.admin));
    expect(first.status).toBe(200);
    expect(first.body.items.map((r: { code: string; occupants: number; beds: number }) => `${r.code} ${r.occupants}/${r.beds}`)).toEqual(['CF102 2/3', 'CF103 1/3']);
    const second = await request(app).get(`/api/v1/hostel/rooms?free=true&q=CF10&limit=2&cursor=${first.body.nextCursor}`).set(auth(token.admin));
    expect(second.body).toEqual({ items: [expect.objectContaining({ code: 'CF104', occupants: 0 })], nextCursor: null });

    const any = await request(app).get('/api/v1/hostel/rooms?q=CF&limit=2').set(auth(token.admin));
    expect(any.body.items.map((r: { code: string }) => r.code)).toEqual(['CF101', 'CF102']);
    const everyFree = await request(app).get('/api/v1/hostel/rooms?free=true').set(auth(token.warden));
    expect(everyFree.body.items.map((r: { code: string }) => r.code)).toEqual(['CF102', 'CF103', 'CF104', 'CS201', 'CS202']);
    for (const bad of ['C$', '.*', 'CS2400', '2CS']) {
      expect((await request(app).get(`/api/v1/hostel/rooms?q=${encodeURIComponent(bad)}`).set(auth(token.admin))).status).toBe(400);
    }
  });

  it("never counts or shows another institution's rooms or users", async () => {
    const a = await institution('A University', 'a-');
    const b = await institution('B University', 'b-');
    await layout(a.token.admin);
    await layout(b.token.admin);
    const aRoom = (await RoomModel.findOne({ institutionId: a.inst._id, code: 'CS201' }).lean())!;
    for (let i = 0; i < 2; i++) await makeUser(a.inst._id, { roles: ['student'], roomId: aRoom._id });
    const res = await request(app).get('/api/v1/hostel/rooms?free=true&q=CS').set(auth(b.token.admin));
    expect(res.body.items.map((r: { code: string; occupants: number }) => `${r.code} ${r.occupants}`)).toEqual(['CS201 0', 'CS202 0']);
  });
});
