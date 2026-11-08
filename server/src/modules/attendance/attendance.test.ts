import crypto from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import type { Types } from 'mongoose';
import type { Role } from '@spacebasic/shared';
import { createApp } from '../../app';
import { encodeQrToken, QR_TOKEN_LENGTH } from '../../core/security/tokens';
import { useTestDb } from '../../test/db';
import { CONSENT, makeInstitution, makeRoom, makeUser } from '../../test/factory';
import { AuditModel } from '../../core/audit/audit';
import { InstitutionModel } from '../institutions/institution.model';
import { NotificationModel } from '../notifications/notification.model';
import { UserModel } from '../users/user.model';
import { AttendanceLogModel } from './attendance.model';
import { dayRange, RESCAN_WINDOW_MS, todayIn } from './attendance.service';

useTestDb();

let app: Express;
beforeEach(() => { app = createApp(); });

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function signIn(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123', consent: CONSENT });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function world(name = 'Test University', prefix = '') {
  const inst = await makeInstitution(name);
  const room = await makeRoom(inst._id, 'CS240');
  const mk = async (role: Role, fullName: string, roomId?: Types.ObjectId) => {
    const email = `${prefix}${role}@example.com`;
    const user = await makeUser(inst._id, { email, roles: [role], fullName, roomId });
    return { user, token: await signIn(email) };
  };
  return {
    inst,
    student: await mk('student', 'Arjun Rao', room._id),
    warden: await mk('warden', 'Meera Nair'),
    admin: await mk('institution_admin', 'Rahul Verma'),
  };
}

const qrToken = async (studentToken: string) => (await request(app).get('/api/v1/attendance/qr-token').set(auth(studentToken))).body.token as string;
const scan = (scannerToken: string, token: string) => request(app).post('/api/v1/attendance/scan').set(auth(scannerToken)).send({ token });

/** Sign a QR token directly, to test expiry and tampering without waiting. */
function forge(claims: { sub: string; inst: string }, opts: { iat?: number; secret?: string } = {}) {
  const iat = opts.iat ?? Math.floor(Date.now() / 1000);
  return encodeQrToken({ ...claims, jti: crypto.randomBytes(10), iat }, opts.secret);
}

/** The body fields of a QR token (docs/api.md "Attendance"): format, sub, inst, jti, iat. */
function unpack(token: string) {
  const body = Buffer.from(token.split('.')[0]!, 'base64url');
  return { format: body[0], sub: body.subarray(1, 13).toString('hex'), inst: body.subarray(13, 25).toString('hex'), jti: body.subarray(25, 35).toString('base64url'), iat: body.readUInt32BE(35), bytes: body.length };
}

describe('GET /attendance/qr-token (Entry Pass)', () => {
  it('gives the student a 15 s single-use token with no personal data, never cached', async () => {
    const { student, inst } = await world();
    const res = await request(app).get('/api/v1/attendance/qr-token').set(auth(student.token));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.refreshAfterMs).toBe(10_000);
    const ttl = Date.parse(res.body.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(10_000);
    expect(ttl).toBeLessThanOrEqual(15_000);
    // Always 96 characters, so the QR is always version 6-M (41 x 41 modules) like the screenshot.
    expect(res.body.token).toHaveLength(QR_TOKEN_LENGTH);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{52}\.[A-Za-z0-9_-]{43}$/);
    const body = unpack(res.body.token);
    expect(body).toMatchObject({ format: 1, sub: String(student.user._id), inst: String(inst._id), bytes: 39 });
    expect(Date.parse(res.body.expiresAt)).toBe((body.iat + 15) * 1000);
    expect(Buffer.from(res.body.token.split('.')[0], 'base64url').toString('latin1')).not.toMatch(/Arjun|example\.com|CS240/);
    const again = await request(app).get('/api/v1/attendance/qr-token').set(auth(student.token));
    expect(unpack(again.body.token).jti).not.toBe(body.jti);
  });

  it('only students get a pass', async () => {
    const { warden } = await world();
    expect((await request(app).get('/api/v1/attendance/qr-token').set(auth(warden.token))).status).toBe(403);
    expect((await request(app).get('/api/v1/attendance/qr-token')).status).toBe(401);
  });
});

describe('POST /attendance/scan', () => {
  it('marks attendance, tells the warden who it was, notifies the student and audits it', async () => {
    const { inst, student, warden } = await world();
    const res = await scan(warden.token, await qrToken(student.token));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ student: { fullName: 'Arjun Rao', room: 'West CS240' }, scannedAt: expect.any(String), kind: 'attendance' });

    const log = await AttendanceLogModel.findOne({ institutionId: inst._id, studentId: student.user._id }).lean();
    expect(log?.scannedBy.equals(warden.user._id)).toBe(true);
    const n = await NotificationModel.findOne({ institutionId: inst._id, userId: student.user._id }).lean();
    expect(n).toMatchObject({ type: 'attendance_marked', title: 'Attendance Marked', body: 'Scanned by Meera Nair.' });
    expect(n?.link?.refId?.equals(log!._id)).toBe(true);
    expect(await AuditModel.exists({ action: 'attendance.scan', actorId: warden.user._id, targetId: student.user._id })).toBeTruthy();

    const unread = await request(app).get('/api/v1/notifications/unread-count').set(auth(student.token));
    expect(unread.body).toEqual({ count: 1 });
  });

  it('admins can scan too; students cannot', async () => {
    const { student, admin } = await world();
    expect((await scan(admin.token, await qrToken(student.token))).status).toBe(201);
    expect((await scan(student.token, await qrToken(student.token))).status).toBe(403);
  });

  it('a token works once: replaying it is 409 ALREADY_SCANNED, even after the re-scan window', async () => {
    const { inst, student, warden } = await world();
    const token = await qrToken(student.token);
    expect((await scan(warden.token, token)).status).toBe(201);
    // Move the first scan out of the 5-minute window so only the single-use rule can stop the replay.
    await AttendanceLogModel.updateMany({ institutionId: inst._id }, { $set: { scannedAt: new Date(Date.now() - RESCAN_WINDOW_MS - 60_000) } });
    const replay = await scan(warden.token, token);
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('ALREADY_SCANNED');
    expect(await AttendanceLogModel.countDocuments({ institutionId: inst._id })).toBe(1);
  });

  it('a second scan of the same student within 5 minutes is a double tap (409); after that it counts again', async () => {
    const { inst, student, warden } = await world();
    expect((await scan(warden.token, await qrToken(student.token))).status).toBe(201);
    const twice = await scan(warden.token, await qrToken(student.token));
    expect(twice.status).toBe(409);
    expect(twice.body.error).toMatchObject({ code: 'ALREADY_SCANNED', message: 'Arjun Rao was marked a moment ago.' });
    await AttendanceLogModel.updateMany({ institutionId: inst._id }, { $set: { scannedAt: new Date(Date.now() - RESCAN_WINDOW_MS - 1000) } });
    expect((await scan(warden.token, await qrToken(student.token))).status).toBe(201);
  });

  it('rejects expired, forged, tampered and non-QR tokens with 400 (expired says so)', async () => {
    const { inst, student, warden } = await world();
    const who = { sub: String(student.user._id), inst: String(inst._id) };
    const expired = await scan(warden.token, forge(who, { iat: Math.floor(Date.now() / 1000) - 60 }));
    expect(expired.status).toBe(400);
    expect(expired.body.error.fields.token).toMatch(/expired/);
    const good = forge(who);
    const [b64, mac] = good.split('.') as [string, string];
    const otherStudent = Buffer.from(b64, 'base64url');
    otherStudent.writeUInt8(otherStudent.readUInt8(12) ^ 1, 12); // a different sub under the old MAC
    // The MAC's last character carries 2 unused bits: flipping the lowest one decodes to the same bytes.
    const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const respelt = mac.slice(0, -1) + B64URL[B64URL.indexOf(mac.at(-1)!) ^ 1];
    for (const bad of [
      forge(who, { secret: 'x'.repeat(40) }), // wrong key
      forge(who, { iat: Math.floor(Date.now() / 1000) + 60 }), // issued in the future
      `${otherStudent.toString('base64url')}.${mac}`, // tampered body
      `${b64}.${respelt}`, // non-canonical MAC
      good.slice(0, -1), // truncated
      student.token, // an access token is not a QR token
      'not-a-qr-token-but-long-enough-to-pass-the-length-check',
    ]) {
      const res = await scan(warden.token, bad);
      expect(res.status).toBe(400);
      expect(res.body.error.fields.token).toMatch(/not a valid/);
    }
    expect((await request(app).post('/api/v1/attendance/scan').set(auth(warden.token)).send({})).status).toBe(400);
    expect(await AttendanceLogModel.countDocuments({ institutionId: inst._id })).toBe(0);
  });

  it("another institution's pass, a disabled student or a non-student is 404 and nothing is logged", async () => {
    const a = await world('A University', 'a-');
    const b = await world('B University', 'b-');
    const foreign = await scan(a.warden.token, await qrToken(b.student.token));
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.message).toBe('No student found for this QR code.');
    expect((await scan(a.warden.token, forge({ sub: String(a.warden.user._id), inst: String(a.inst._id) }))).status).toBe(404);
    const token = await qrToken(a.student.token);
    await UserModel.updateOne({ _id: a.student.user._id, institutionId: a.inst._id }, { $set: { status: 'disabled' } });
    expect((await scan(a.warden.token, token)).status).toBe(404);
    expect(await AttendanceLogModel.countDocuments({ institutionId: { $in: [a.inst._id, b.inst._id] } }).setOptions({ unscoped: 'test: count across both' })).toBe(0);
  });

  it('limits each scanner to 120 scans a minute', async () => {
    const { warden } = await world();
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await scan(warden.token, 'x'.repeat(30))).status;
    expect(last).toBe(429);
  });

  it('answers 404 when the attendance module is switched off', async () => {
    const { inst, student } = await world();
    await InstitutionModel.updateOne({ _id: inst._id }, { $pull: { enabledModules: 'attendance' } });
    expect((await request(app).get('/api/v1/attendance/qr-token').set(auth(student.token))).status).toBe(404);
  });
});

describe('attendance history', () => {
  it('a student sees their own scans with who scanned them', async () => {
    const { student, warden, inst } = await world();
    const other = await makeUser(inst._id, { email: 'other@example.com', roles: ['student'] });
    await AttendanceLogModel.create({ institutionId: inst._id, studentId: other._id, scannedBy: warden.user._id, scannedAt: new Date(), kind: 'attendance', jti: 'other-1' });
    await scan(warden.token, await qrToken(student.token));
    const res = await request(app).get('/api/v1/attendance/me').set(auth(student.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [{ scannedAt: expect.any(String), kind: 'attendance', scannedByName: 'Meera Nair' }], nextCursor: null });
    expect((await request(app).get('/api/v1/attendance').set(auth(student.token))).status).toBe(403);
  });

  it("wardens list a day's scans in the institution's time zone, newest first, paged", async () => {
    const { inst, student, warden } = await world();
    const today = todayIn('Asia/Kolkata');
    const { start } = dayRange(today, 'Asia/Kolkata');
    const log = (minutes: number, jti: string) =>
      AttendanceLogModel.create({ institutionId: inst._id, studentId: student.user._id, scannedBy: warden.user._id, scannedAt: new Date(start.getTime() + minutes * 60_000), kind: 'attendance', jti });
    await log(-1, 'yesterday-late'); // 23:59 the day before: not today
    await log(1, 'today-early');
    await log(2, 'today-later');

    const first = await request(app).get(`/api/v1/attendance?limit=1`).set(auth(warden.token));
    expect(first.status).toBe(200);
    expect(first.body.date).toBe(today);
    expect(first.body.items).toEqual([{ student: { id: String(student.user._id), fullName: 'Arjun Rao' }, room: 'West CS240', scannedAt: new Date(start.getTime() + 120_000).toISOString(), kind: 'attendance', scannedByName: 'Meera Nair' }]);
    const second = await request(app).get(`/api/v1/attendance?limit=1&cursor=${first.body.nextCursor}`).set(auth(warden.token));
    expect(second.body.items.map((i: { scannedAt: string }) => i.scannedAt)).toEqual([new Date(start.getTime() + 60_000).toISOString()]);
    expect(second.body.nextCursor).toBeNull();

    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    expect((await request(app).get(`/api/v1/attendance?date=${yesterday}`).set(auth(warden.token))).body.items).toHaveLength(1);
    expect((await request(app).get('/api/v1/attendance?date=2026-02-30').set(auth(warden.token))).status).toBe(400);
  });

  it("never lists another institution's scans", async () => {
    const a = await world('A University', 'a-');
    const b = await world('B University', 'b-');
    await scan(b.warden.token, await qrToken(b.student.token));
    expect((await request(app).get('/api/v1/attendance').set(auth(a.warden.token))).body.items).toEqual([]);
  });
});

describe('dayRange', () => {
  it('India: one day is 18:30 UTC to 18:30 UTC', () => {
    expect(dayRange('2026-11-08', 'Asia/Kolkata')).toEqual({ start: new Date('2026-11-07T18:30:00Z'), end: new Date('2026-11-08T18:30:00Z') });
  });
  it('handles a daylight-saving change (a 23-hour day)', () => {
    const { start, end } = dayRange('2026-03-08', 'America/New_York');
    expect(start).toEqual(new Date('2026-03-08T05:00:00Z'));
    expect(end).toEqual(new Date('2026-03-09T04:00:00Z'));
  });
});
