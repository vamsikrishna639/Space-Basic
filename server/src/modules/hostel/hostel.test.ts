import request from 'supertest';
import type { Express } from 'express';
import type { Types } from 'mongoose';
import type { Role } from '@spacebasic/shared';
import { createApp } from '../../app';
import { useTestDb } from '../../test/db';
import { CONSENT, makeInstitution, makeUser } from '../../test/factory';
import { AuditModel } from '../../core/audit/audit';
import { FloorModel, RoomModel } from './hostel.models';
import { UserModel } from '../users/user.model';

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
          { code: 'CF', name: 'First floor', order: 1, roomNumberMin: 101, roomNumberMax: 104, bedsPerRoom: 3, roomCount: 4, beds: 12, occupied: 0 },
          { code: 'CS', name: 'Second floor', order: 2, roomNumberMin: 201, roomNumberMax: 202, bedsPerRoom: 2, roomCount: 2, beds: 4, occupied: 0 },
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

// ---------------------------------------------------------------------------------------------------------
// Admin > Hostel: rooms by range, deleting (decisions.md 2026-11-09)

const range = (t: string, body: object) => request(app).post('/api/v1/hostel/rooms/range').set(auth(t)).send(body);
const rangeDelete = (t: string, body: object) => request(app).post('/api/v1/hostel/rooms/range/delete').set(auth(t)).send(body);
const westBlock = (t: string) => request(app).post('/api/v1/hostel/hostels').set(auth(t)).send({ name: 'West', code: 'W' });
const roomId = async (instId: Types.ObjectId, code: string) => (await RoomModel.findOne({ institutionId: instId, code }).lean())!._id;

describe('POST /hostel/rooms/range (create rooms from a number range)', () => {
  it('previews, then creates the real layout: 3 floors x 80 rooms x 3 beds; repeating skips what exists', async () => {
    const { token, inst } = await institution();
    expect((await westBlock(token.admin)).status).toBe(201);

    const preview = await range(token.admin, { hostelCode: 'W', floorCode: 'cf', floorName: 'First floor', from: 101, to: 180, beds: 3, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ dryRun: true, floor: { code: 'CF', name: 'First floor', isNew: true }, skipped: [], beds: 240 });
    expect(preview.body.created).toHaveLength(80);
    expect(preview.body.created[0]).toBe('CF101');
    expect(preview.body.created[79]).toBe('CF180');
    expect(await RoomModel.countDocuments({ institutionId: inst._id })).toBe(0); // a preview writes nothing
    expect(await FloorModel.countDocuments({ institutionId: inst._id })).toBe(0);

    for (const [code, name, from] of [['CF', 'First floor', 101], ['CS', 'Second floor', 201], ['CT', 'Third floor', 301]] as const) {
      const res = await range(token.admin, { hostelCode: 'W', floorCode: code, floorName: name, from, to: from + 79, beds: 3 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ dryRun: false, floor: { code, isNew: true }, skipped: [], beds: 240 });
      expect(res.body.created).toHaveLength(80);
    }
    const structure = await request(app).get('/api/v1/hostel/structure').set(auth(token.admin));
    expect(structure.body[0].floors.map((f: { code: string; roomCount: number; beds: number; roomNumberMin: number; roomNumberMax: number }) =>
      `${f.code} ${f.roomNumberMin}-${f.roomNumberMax} ${f.roomCount} rooms ${f.beds} beds`)).toEqual([
      'CF 101-180 80 rooms 240 beds', 'CS 201-280 80 rooms 240 beds', 'CT 301-380 80 rooms 240 beds',
    ]);
    expect(await RoomModel.countDocuments({ institutionId: inst._id })).toBe(240);
    expect((await RoomModel.findOne({ institutionId: inst._id, code: 'CF127' }).lean())).toMatchObject({ number: 127, beds: 3 });

    // The same range again, a little wider: only the new rooms are created; the floor name isn't needed now.
    const again = await range(token.admin, { hostelCode: 'W', floorCode: 'CF', from: 175, to: 182, beds: 2 });
    expect(again.status).toBe(201);
    expect(again.body.created).toEqual(['CF181', 'CF182']);
    expect(again.body.skipped).toEqual(['CF175', 'CF176', 'CF177', 'CF178', 'CF179', 'CF180']);
    expect((await RoomModel.findOne({ institutionId: inst._id, code: 'CF180' }).lean())?.beds).toBe(3); // existing rooms unchanged
    expect((await RoomModel.findOne({ institutionId: inst._id, code: 'CF182' }).lean())?.beds).toBe(2);

    expect(await AuditModel.countDocuments({ action: 'floor.create' })).toBe(3);
    const audits = await AuditModel.find({ action: 'rooms.create' }).sort({ at: 1 }).lean();
    expect(audits.map((a) => a.meta)).toEqual([
      { floor: 'CF', from: 101, to: 180, beds: 3, created: 80, skipped: 0 },
      { floor: 'CS', from: 201, to: 280, beds: 3, created: 80, skipped: 0 },
      { floor: 'CT', from: 301, to: 380, beds: 3, created: 80, skipped: 0 },
      { floor: 'CF', from: 175, to: 182, beds: 2, created: 2, skipped: 6 },
    ]);
  });

  it('validates the range, the beds and the new floor name; a floor code belongs to one block', async () => {
    const { token } = await institution();
    await westBlock(token.admin);
    await request(app).post('/api/v1/hostel/hostels').set(auth(token.admin)).send({ name: 'East', code: 'E' });
    const base = { hostelCode: 'W', floorCode: 'CF', floorName: 'First floor', from: 101, to: 180, beds: 3 };
    const bad = async (body: object, field: string) => {
      const res = await range(token.admin, { ...base, ...body });
      expect(res.status).toBe(400);
      expect(res.body.error.fields[field]).toBeDefined();
    };
    await bad({ to: 100 }, 'to');
    await bad({ from: 1, to: 600 }, 'to'); // more than 500 at a time
    await bad({ beds: 0 }, 'beds');
    await bad({ beds: 13 }, 'beds');
    await bad({ from: 0 }, 'from');
    await bad({ to: 1000 }, 'to');
    await bad({ floorCode: 'C1' }, 'floorCode');
    await bad({ floorName: undefined }, 'floorName'); // a new floor needs a name
    expect((await range(token.admin, { ...base, hostelCode: 'X' })).status).toBe(404);

    expect((await range(token.admin, base)).status).toBe(201);
    const elsewhere = await range(token.admin, { ...base, hostelCode: 'E', from: 190, to: 191 });
    expect(elsewhere.status).toBe(409);
    expect(elsewhere.body.error.fields.floorCode).toMatch(/West/);
  });

  it('wardens and students cannot create or delete rooms; nothing crosses institutions', async () => {
    const a = await institution('A University', 'a-');
    const b = await institution('B University', 'b-');
    await westBlock(a.token.admin);
    const body = { hostelCode: 'W', floorCode: 'CF', floorName: 'First floor', from: 101, to: 102, beds: 3 };
    for (const t of [a.token.warden, a.token.student]) {
      expect((await range(t, body)).status).toBe(403);
      expect((await rangeDelete(t, { floorCode: 'CF', from: 101, to: 102 })).status).toBe(403);
      expect((await request(app).delete('/api/v1/hostel/rooms/CF101').set(auth(t))).status).toBe(403);
      expect((await request(app).delete('/api/v1/hostel/floors/CF').set(auth(t))).status).toBe(403);
    }
    expect((await range(a.token.admin, body)).status).toBe(201);
    // B's admin sees no block W, floor CF or room CF101 of A's.
    expect((await range(b.token.admin, body)).status).toBe(404);
    expect((await rangeDelete(b.token.admin, { floorCode: 'CF', from: 101, to: 102 })).status).toBe(404);
    expect((await request(app).delete('/api/v1/hostel/rooms/CF101').set(auth(b.token.admin))).status).toBe(404);
    expect((await request(app).delete('/api/v1/hostel/floors/CF').set(auth(b.token.admin))).status).toBe(404);
    expect(await RoomModel.countDocuments({ institutionId: a.inst._id })).toBe(2);
  });
});

describe('deleting rooms and floors', () => {
  async function floorCF(admin: string) {
    await westBlock(admin);
    expect((await range(admin, { hostelCode: 'W', floorCode: 'CF', floorName: 'First floor', from: 101, to: 180, beds: 3 })).status).toBe(201);
  }

  it('reducing a range: blocked while anyone (also a disabled user) is assigned, listing who; then deletes and audits', async () => {
    const { token, inst } = await institution();
    await floorCF(token.admin);
    const priya = await makeUser(inst._id, { fullName: 'Priya Sharma', roles: ['student'], roomId: await roomId(inst._id, 'CF175') });
    const ravi = await makeUser(inst._id, { fullName: 'Ravi Kumar', roles: ['student'], roomId: await roomId(inst._id, 'CF178'), status: 'disabled' });

    const preview = await rangeDelete(token.admin, { floorCode: 'cf', from: 171, to: 180, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({
      dryRun: true, deleted: [],
      blocked: [
        { code: 'CF175', users: [{ id: String(priya._id), fullName: 'Priya Sharma', status: 'active' }] },
        { code: 'CF178', users: [{ id: String(ravi._id), fullName: 'Ravi Kumar', status: 'disabled' }] },
      ],
    });
    const refused = await rangeDelete(token.admin, { floorCode: 'CF', from: 171, to: 180 });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/CF175: Priya Sharma; CF178: Ravi Kumar \(disabled\)/);
    expect(await RoomModel.countDocuments({ institutionId: inst._id })).toBe(80); // nothing deleted

    await UserModel.updateMany({ institutionId: inst._id, _id: { $in: [priya._id, ravi._id] } }, { $set: { roomId: await roomId(inst._id, 'CF101') } });
    const ok = await rangeDelete(token.admin, { floorCode: 'CF', from: 171, to: 180, dryRun: true });
    expect(ok.body).toEqual({ dryRun: true, blocked: [], deleted: ['CF171', 'CF172', 'CF173', 'CF174', 'CF175', 'CF176', 'CF177', 'CF178', 'CF179', 'CF180'] });
    const done = await rangeDelete(token.admin, { floorCode: 'CF', from: 171, to: 180 });
    expect(done.status).toBe(200);
    expect(done.body.deleted).toHaveLength(10);
    expect(await RoomModel.countDocuments({ institutionId: inst._id })).toBe(70);
    const floor = (await request(app).get('/api/v1/hostel/structure').set(auth(token.admin))).body[0].floors[0];
    expect(floor).toMatchObject({ roomNumberMin: 101, roomNumberMax: 170, roomCount: 70, beds: 210, occupied: 1 }); // Ravi is disabled
    expect((await AuditModel.findOne({ action: 'rooms.delete' }).lean())?.meta).toMatchObject({ floor: 'CF', from: 171, to: 180, deleted: 10, kept: [] });
  });

  it('one room: blocked with the names, then deleted (audited); unknown room is 404', async () => {
    const { token, inst } = await institution();
    await floorCF(token.admin);
    const a = await makeUser(inst._id, { fullName: 'Anu Varghese', roles: ['student'], roomId: await roomId(inst._id, 'CF127') });
    await makeUser(inst._id, { fullName: 'Bala Murugan', roles: ['student'], roomId: await roomId(inst._id, 'CF127') });
    const del = () => request(app).delete('/api/v1/hostel/rooms/cf127').set(auth(token.admin));
    const refused = await del();
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe('Room CF127 has 2 people assigned: Anu Varghese, Bala Murugan. Move them to another room first.');
    await UserModel.updateMany({ institutionId: inst._id, roomId: await roomId(inst._id, 'CF127') }, { $set: { roomId: null } });
    const ok = await del();
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ dryRun: false, deleted: ['CF127'], blocked: [] });
    expect((await del()).status).toBe(404);
    expect((await AuditModel.findOne({ action: 'room.delete' }).lean())?.meta).toEqual({ code: 'CF127', beds: 3 });
    expect(a).toBeDefined();
  });

  it('a floor can be deleted only when it has no rooms', async () => {
    const { token, inst } = await institution();
    await westBlock(token.admin);
    await range(token.admin, { hostelCode: 'W', floorCode: 'CG', floorName: 'Typo floor', from: 101, to: 102, beds: 3 });
    const del = () => request(app).delete('/api/v1/hostel/floors/CG').set(auth(token.admin));
    const refused = await del();
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/still has 2 rooms/);
    await rangeDelete(token.admin, { floorCode: 'CG', from: 101, to: 102 });
    expect((await del()).status).toBe(204);
    expect(await FloorModel.countDocuments({ institutionId: inst._id })).toBe(0);
    expect(await AuditModel.exists({ action: 'floor.delete' })).toBeTruthy();
  });

  it('a room being deleted while a student is put in it never leaves the student in a missing room', async () => {
    const { token, inst } = await institution();
    await westBlock(token.admin);
    for (let i = 0; i < 12; i++) {
      const code = `CF${101 + i}`;
      await range(token.admin, { hostelCode: 'W', floorCode: 'CF', floorName: 'First floor', from: 101 + i, to: 101 + i, beds: 3 });
      const student = await makeUser(inst._id, { roles: ['student'] });
      const [assign, del] = await Promise.all([
        request(app).patch(`/api/v1/users/${student._id}`).set(auth(token.admin)).send({ roomCode: code }),
        request(app).delete(`/api/v1/hostel/rooms/${code}`).set(auth(token.admin)),
      ]);
      const room = await RoomModel.findOne({ institutionId: inst._id, code }).lean();
      const after = await UserModel.findOne({ institutionId: inst._id, _id: student._id }).lean();
      if (room) {
        // The delete lost: the student is in the room, and the delete said why.
        expect(del.status).toBe(409);
        expect(assign.status).toBe(200);
        expect(String(after!.roomId)).toBe(String(room._id));
      } else {
        // The delete won: the assignment failed and the student has no room.
        expect(del.status).toBe(200);
        expect(assign.status).not.toBe(200);
        expect(after!.roomId ?? null).toBeNull();
      }
    }
  });

  it('a student placed in the room after the "anyone assigned?" check makes the delete keep the room (revision check)', async () => {
    const { token, inst } = await institution();
    await westBlock(token.admin);
    await range(token.admin, { hostelCode: 'W', floorCode: 'CF', floorName: 'First floor', from: 101, to: 103, beds: 3 });
    const cf102 = await roomId(inst._id, 'CF102');
    const late = await makeUser(inst._id, { fullName: 'Late Arrival', roles: ['student'] });
    // Force the worst timing: just before CF102 is deleted, an assignment completes exactly as users.service does it
    // (write the user, then bump the room's revision). The delete must notice and keep CF102.
    const realDeleteOne = RoomModel.deleteOne.bind(RoomModel);
    const spy = jest.spyOn(RoomModel, 'deleteOne').mockImplementation(((filter: { _id?: unknown }) => (async () => {
      if (String(filter._id) === String(cf102) && !(await UserModel.exists({ institutionId: inst._id, roomId: cf102 }))) {
        await UserModel.updateOne({ institutionId: inst._id, _id: late._id }, { $set: { roomId: cf102 } });
        await RoomModel.updateOne({ institutionId: inst._id, _id: cf102 }, { $inc: { rev: 1 } });
      }
      return realDeleteOne(filter as Parameters<typeof RoomModel.deleteOne>[0]);
    })()) as unknown as typeof RoomModel.deleteOne); // the service only awaits the result, so a promise stands in for the query
    try {
      const res = await rangeDelete(token.admin, { floorCode: 'CF', from: 101, to: 103 });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toEqual(['CF101', 'CF103']);
      expect(res.body.blocked).toEqual([{ code: 'CF102', users: [{ id: String(late._id), fullName: 'Late Arrival', status: 'active' }] }]);
    } finally {
      spy.mockRestore();
    }
    expect(await RoomModel.exists({ institutionId: inst._id, _id: cf102 })).toBeTruthy();
    expect(String((await UserModel.findOne({ institutionId: inst._id, _id: late._id }).lean())!.roomId)).toBe(String(cf102));
    expect((await AuditModel.findOne({ action: 'rooms.delete' }).lean())?.meta).toMatchObject({ deleted: 2, rooms: ['CF101', 'CF103'], kept: ['CF102'] });
  });
});

describe('Accept / room assignment with rooms created in Admin > Hostel', () => {
  it('a student added without a room can be given one of the new rooms ("3 of 3 beds free" in the picker)', async () => {
    const { token, inst } = await institution();
    // No rooms yet: the picker has nothing to offer, and assigning a room code is refused.
    const added = await request(app).post('/api/v1/users').set(auth(token.admin)).send({ fullName: 'Real Student', email: 'real.student@example.com', roles: ['student'], password: 'First@2026' });
    expect(added.status).toBe(201);
    expect((await request(app).get('/api/v1/hostel/rooms?free=true').set(auth(token.admin))).body.items).toEqual([]);
    expect((await request(app).patch(`/api/v1/users/${added.body.id}`).set(auth(token.admin)).send({ roomCode: 'CF127' })).status).toBe(400);

    await westBlock(token.admin);
    await range(token.admin, { hostelCode: 'W', floorCode: 'CF', floorName: 'First floor', from: 101, to: 180, beds: 3 });
    const picker = await request(app).get('/api/v1/hostel/rooms?free=true&q=CF12&limit=30').set(auth(token.admin));
    expect(picker.body.items[0]).toEqual({ code: 'CF120', number: 120, floorCode: 'CF', hostelCode: 'W', beds: 3, occupants: 0 });
    const accepted = await request(app).patch(`/api/v1/users/${added.body.id}`).set(auth(token.admin)).send({ roomCode: 'CF127' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.room).toMatchObject({ code: 'CF127', display: 'West CF127' });
    const room = (await request(app).get('/api/v1/hostel/rooms?q=CF127').set(auth(token.admin))).body.items[0];
    expect(room).toMatchObject({ code: 'CF127', beds: 3, occupants: 1 });
    // And the bed count can't go below the beds taken.
    expect((await request(app).patch('/api/v1/hostel/rooms/CF127').set(auth(token.admin)).send({ beds: 1 })).status).toBe(200);
    expect((await request(app).patch('/api/v1/hostel/rooms/CF127').set(auth(token.admin)).send({ beds: 3 })).status).toBe(200);
    await makeUser(inst._id, { roles: ['student'], roomId: await roomId(inst._id, 'CF127') });
    const down = await request(app).patch('/api/v1/hostel/rooms/CF127').set(auth(token.admin)).send({ beds: 1 });
    expect(down.status).toBe(409);
    expect(down.body.error.fields.beds).toMatch(/2 occupants/);
  });
});
