import request from 'supertest';
import type { Express } from 'express';
import type { Role } from '@spacebasic/shared';
import { createApp } from '../app';
import { useTestDb } from './db';
import { CONSENT, makeInstitution, makeRoom, makeUser } from './factory';

// Role separation on the server (docs/architecture.md §5). The client also hides staff screens from students and
// student screens from staff, but these answers are what actually keeps them apart. Every route checks its
// permission before it validates anything, so the body and ids below never need to be valid.

useTestDb();
let app: Express;
beforeEach(() => { app = createApp(); });

const ID = '64b7f0c2a1b2c3d4e5f60718';
type Call = [method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string];

/** Admin-only: managing users, the hostel, the logo and the support content. */
const ADMIN_ONLY: Call[] = [
  ['post', '/users'], ['post', '/users/import'], ['patch', `/users/${ID}`], ['patch', `/users/${ID}/roles`],
  ['post', '/hostel/hostels'], ['post', '/hostel/floors'], ['post', '/hostel/floors/CS/rooms/generate'], ['patch', '/hostel/rooms/CS240'],
  ['put', '/institutions/current/logo'],
  ['post', '/support/contacts'], ['patch', `/support/contacts/${ID}`], ['delete', `/support/contacts/${ID}`],
  ['post', '/support/faqs'], ['patch', `/support/faqs/${ID}`], ['delete', `/support/faqs/${ID}`],
  ['get', '/support/faqs?includeUnpublished=true'],
];
/** Warden and admin: the scanner, the day's attendance, user and hostel lookups. */
const STAFF: Call[] = [['post', '/attendance/scan'], ['get', '/attendance'], ['get', '/users'], ['get', '/hostel/structure'], ['get', '/hostel/rooms']];
/** Student-only: the Entry Pass and one's own attendance history. */
const STUDENT_ONLY: Call[] = [['get', '/attendance/qr-token'], ['get', '/attendance/me']];

async function tokenFor(roles: Role[]) {
  const inst = await makeInstitution();
  const room = await makeRoom(inst._id);
  const email = `${roles.join('-')}@example.com`;
  await makeUser(inst._id, { email, roles, roomId: roles.includes('student') ? room._id : undefined });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123', consent: CONSENT });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

const call = (token: string, [method, path]: Call) => request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`).send({});
const label = ([m, p]: Call) => `${m.toUpperCase()} ${p}`;

describe('role separation (server)', () => {
  it('a student is refused (403) on every staff and admin endpoint', async () => {
    const t = await tokenFor(['student']);
    for (const c of [...STAFF, ...ADMIN_ONLY]) expect([label(c), (await call(t, c)).status]).toEqual([label(c), 403]);
  });

  it('a warden is refused (403) on every admin-only endpoint', async () => {
    const t = await tokenFor(['warden']);
    for (const c of ADMIN_ONLY) expect([label(c), (await call(t, c)).status]).toEqual([label(c), 403]);
  });

  it('wardens and admins are refused (403) on the student-only endpoints', async () => {
    for (const roles of [['warden'], ['institution_admin']] as Role[][]) {
      const t = await tokenFor(roles);
      for (const c of STUDENT_ONLY) expect([roles[0], label(c), (await call(t, c)).status]).toEqual([roles[0], label(c), 403]);
    }
  });

  it('the staff endpoints answer staff (never 401/403 for a warden; admins get every one)', async () => {
    const warden = await tokenFor(['warden']);
    for (const c of STAFF) expect([label(c), [401, 403].includes((await call(warden, c)).status)]).toEqual([label(c), false]);
    const admin = await tokenFor(['institution_admin']);
    for (const c of [...STAFF, ...ADMIN_ONLY]) expect([label(c), [401, 403].includes((await call(admin, c)).status)]).toEqual([label(c), false]);
  });

  it('a user with two roles gets the union, and nothing more: student + warden can scan and has a pass, but no admin endpoint', async () => {
    const t = await tokenFor(['student', 'warden']);
    for (const c of [...STAFF, ...STUDENT_ONLY]) expect([label(c), [401, 403].includes((await call(t, c)).status)]).toEqual([label(c), false]);
    for (const c of ADMIN_ONLY) expect([label(c), (await call(t, c)).status]).toEqual([label(c), 403]);
  });
});
