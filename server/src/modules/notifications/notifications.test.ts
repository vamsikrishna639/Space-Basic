import request from 'supertest';
import type { Express } from 'express';
import type { Types } from 'mongoose';
import { NOTIFICATION_TYPES } from '@spacebasic/shared';
import { createApp } from '../../app';
import { useTestDb } from '../../test/db';
import { CONSENT, makeInstitution, makeUser } from '../../test/factory';
import { InstitutionModel } from '../institutions/institution.model';
import { UserModel } from '../users/user.model';
import { seedDevData, seedDevNotifications } from '../../scripts/seed-data';
import { NotificationModel } from './notification.model';
import { createNotification } from './notifications.service';

useTestDb();

let app: Express;
beforeEach(() => { app = createApp(); });

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function person(institutionId: Types.ObjectId, email: string) {
  const user = await makeUser(institutionId, { email });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123', consent: CONSENT });
  return { user, token: res.body.accessToken as string };
}

/** n notifications for a user, one minute apart, oldest first. */
async function give(institutionId: Types.ObjectId, userId: Types.ObjectId, n: number) {
  const base = Date.now() - 60 * 60_000;
  for (let i = 0; i < n; i++) {
    await createNotification({ institutionId, userId, type: NOTIFICATION_TYPES[i % NOTIFICATION_TYPES.length]!, body: `#${i}`, createdAt: new Date(base + i * 60_000) });
  }
}

describe('GET /notifications', () => {
  it('lists my notifications newest first with the screenshot titles and deep links', async () => {
    const inst = await makeInstitution();
    const me = await person(inst._id, 'me@example.com');
    await give(inst._id, me.user._id, 2);
    const res = await request(app).get('/api/v1/notifications').set(auth(me.token));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.items).toEqual([
      { id: expect.any(String), type: 'announcement_new', title: '👋 New Announcement', body: '#1', link: { module: 'announcements', refId: null }, readAt: null, createdAt: expect.any(String) },
      { id: expect.any(String), type: 'attendance_marked', title: 'Attendance Marked', body: '#0', link: { module: 'attendance', refId: null }, readAt: null, createdAt: expect.any(String) },
    ]);
  });

  it('pages with a cursor and rejects a forged one', async () => {
    const inst = await makeInstitution();
    const me = await person(inst._id, 'me@example.com');
    await give(inst._id, me.user._id, 7);
    const bodies: string[] = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await request(app).get(`/api/v1/notifications?limit=3${cursor ? `&cursor=${cursor}` : ''}`).set(auth(me.token));
      bodies.push(...res.body.items.map((n: { body: string }) => n.body));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(bodies).toEqual(['#6', '#5', '#4', '#3', '#2', '#1', '#0']);
    expect((await request(app).get('/api/v1/notifications?cursor=xyz').set(auth(me.token))).status).toBe(400);
    expect((await request(app).get('/api/v1/notifications?limit=51').set(auth(me.token))).status).toBe(400);
  });

  it("never shows another user's notifications, in this or another institution", async () => {
    const a = await makeInstitution('A University');
    const b = await makeInstitution('B University');
    const me = await person(a._id, 'me@example.com');
    const roommate = await makeUser(a._id, { email: 'roommate@example.com' });
    const stranger = await makeUser(b._id, { email: 'stranger@example.com' });
    await give(a._id, roommate._id, 2);
    await give(b._id, stranger._id, 2);
    expect((await request(app).get('/api/v1/notifications').set(auth(me.token))).body.items).toEqual([]);
    expect((await request(app).get('/api/v1/notifications/unread-count').set(auth(me.token))).body).toEqual({ count: 0 });
  });

  it('every role can read its own; signed-out callers get 401', async () => {
    const inst = await makeInstitution();
    for (const roles of [['student'], ['warden'], ['institution_admin']] as const) {
      const email = `${roles[0]}@example.com`;
      await makeUser(inst._id, { email, roles: [...roles] });
      const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123', consent: CONSENT });
      expect((await request(app).get('/api/v1/notifications').set(auth(login.body.accessToken))).status).toBe(200);
    }
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
  });
});

describe('unread count and mark read', () => {
  it('counts unread, marks one read (idempotently, keeping the first readAt)', async () => {
    const inst = await makeInstitution();
    const me = await person(inst._id, 'me@example.com');
    await give(inst._id, me.user._id, 3);
    const count = async () => (await request(app).get('/api/v1/notifications/unread-count').set(auth(me.token))).body.count;
    expect(await count()).toBe(3);

    const [newest] = (await request(app).get('/api/v1/notifications').set(auth(me.token))).body.items;
    expect((await request(app).post(`/api/v1/notifications/${newest.id}/read`).set(auth(me.token))).status).toBe(204);
    expect(await count()).toBe(2);
    const first = await NotificationModel.findOne({ institutionId: inst._id, _id: newest.id }).lean();
    await new Promise((r) => setTimeout(r, 5));
    expect((await request(app).post(`/api/v1/notifications/${newest.id}/read`).set(auth(me.token))).status).toBe(204);
    const second = await NotificationModel.findOne({ institutionId: inst._id, _id: newest.id }).lean();
    expect(second?.readAt?.getTime()).toBe(first?.readAt?.getTime());
    expect((await request(app).get('/api/v1/notifications').set(auth(me.token))).body.items[0].readAt).toBe(first?.readAt?.toISOString());
  });

  it("someone else's notification is 404 and stays unread; a bad id is 400", async () => {
    const a = await makeInstitution('A University');
    const b = await makeInstitution('B University');
    const me = await person(a._id, 'me@example.com');
    const roommate = await makeUser(a._id, { email: 'roommate@example.com' });
    const stranger = await makeUser(b._id, { email: 'stranger@example.com' });
    const theirs = await createNotification({ institutionId: a._id, userId: roommate._id, type: 'attendance_marked' });
    const foreign = await createNotification({ institutionId: b._id, userId: stranger._id, type: 'attendance_marked' });
    for (const id of [theirs.id, foreign.id, '0123456789abcdef01234567']) {
      expect((await request(app).post(`/api/v1/notifications/${id}/read`).set(auth(me.token))).status).toBe(404);
    }
    expect(await NotificationModel.countDocuments({ institutionId: a._id, readAt: { $ne: null } })).toBe(0);
    expect((await request(app).post('/api/v1/notifications/not-an-id/read').set(auth(me.token))).status).toBe(400);
  });
});

describe('module gate', () => {
  it('answers 404 when the institution has the notifications module switched off', async () => {
    const inst = await makeInstitution();
    const me = await person(inst._id, 'me@example.com');
    await InstitutionModel.updateOne({ _id: inst._id }, { $pull: { enabledModules: 'notifications' } });
    expect((await request(app).get('/api/v1/notifications').set(auth(me.token))).status).toBe(404);
    expect((await request(app).get('/api/v1/notifications/unread-count').set(auth(me.token))).status).toBe(404);
  });
});

describe('dev seed', () => {
  it('adds sample notifications of every type for each dev user, once', async () => {
    await seedDevData();
    const inst = await InstitutionModel.findOne({ slug: 'presidency-university' }).lean();
    const student = await UserModel.findOne({ institutionId: inst!._id, email: 'arjun.rao@example.com' }).lean();
    const mine = await NotificationModel.find({ institutionId: inst!._id, userId: student!._id }).sort({ createdAt: -1 }).lean();
    expect(new Set(mine.map((n) => n.type))).toEqual(new Set(NOTIFICATION_TYPES));
    expect(mine.filter((n) => n.readAt).length).toBe(2);
    expect(mine[0]!.title).toBe('Attendance Marked');
    expect(mine.every((n) => n.createdAt.getTime() < Date.now())).toBe(true); // samples are never in the future
    const total = await NotificationModel.countDocuments({ institutionId: inst!._id });
    expect(await seedDevNotifications(inst!._id)).toBe(0); // nothing added the second time
    expect(await NotificationModel.countDocuments({ institutionId: inst!._id })).toBe(total);
  });
});
