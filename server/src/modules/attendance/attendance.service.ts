import { Types } from 'mongoose';
import {
  QR_REFRESH_AFTER_MS, roomDisplay,
  type AttendanceItem, type MyAttendanceItem, type Page, type QrTokenResult, type ScanResult,
} from '@spacebasic/shared';
import { errors } from '../../core/http/errors';
import { audit } from '../../core/audit/audit';
import { signQrToken, verifyQrToken } from '../../core/security/tokens';
import { InstitutionModel } from '../institutions/institution.model';
import { HostelModel, RoomModel } from '../hostel/hostel.models';
import { UserModel } from '../users/user.model';
import { createNotification } from '../notifications/notifications.service';
import { AttendanceLogModel, type AttendanceLog } from './attendance.model';

// QR attendance (docs/architecture.md §9, docs/api.md "Attendance").

type Ctx = Express.AuthContext;
interface Who { institutionId: Types.ObjectId; userId: Types.ObjectId }

/** A second scan of the same student this soon is a double tap on the scanner, not a new attendance. */
export const RESCAN_WINDOW_MS = 5 * 60_000;

// ---------------------------------------------------------------------------------------------------------
// helpers

async function roomDisplays(institutionId: Types.ObjectId, roomIds: Types.ObjectId[]): Promise<Map<string, string>> {
  const ids = [...new Set(roomIds.map(String))];
  if (!ids.length) return new Map();
  const rooms = await RoomModel.find({ institutionId, _id: { $in: ids } }, { code: 1, hostelId: 1 }).lean();
  const hostels = await HostelModel.find({ institutionId, _id: { $in: [...new Set(rooms.map((r) => String(r.hostelId)))] } }, { name: 1 }).lean();
  const hostelName = new Map(hostels.map((h) => [String(h._id), h.name]));
  return new Map(rooms.flatMap((r) => {
    const name = hostelName.get(String(r.hostelId));
    return name ? [[String(r._id), roomDisplay(name, r.code)] as const] : [];
  }));
}

async function namesOf(institutionId: Types.ObjectId, ids: Types.ObjectId[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))];
  if (!unique.length) return new Map();
  const users = await UserModel.find({ institutionId, _id: { $in: unique } }, { fullName: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.fullName]));
}

function decodeCursor(cursor: string): { t: Date; i: Types.ObjectId } {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    const t = typeof v.t === 'string' ? new Date(v.t) : null;
    if (t && !Number.isNaN(t.getTime()) && typeof v.i === 'string' && Types.ObjectId.isValid(v.i)) return { t, i: new Types.ObjectId(v.i) };
  } catch { /* fall through */ }
  throw errors.validation({ cursor: 'Invalid cursor' });
}
const encodeCursor = (l: AttendanceLog) => Buffer.from(JSON.stringify({ t: l.scannedAt.toISOString(), i: String(l._id) })).toString('base64url');
const afterCursor = (cursor?: string) => {
  if (!cursor) return {};
  const c = decodeCursor(cursor);
  return { $or: [{ scannedAt: { $lt: c.t } }, { scannedAt: c.t, _id: { $lt: c.i } }] };
};

/** Milliseconds to add to UTC to get the wall-clock time in `timeZone` at instant `t`. */
function tzOffset(timeZone: string, t: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - (t - (t % 1000));
}

/** Local midnight of `date` (YYYY-MM-DD) in `timeZone`, as a UTC instant. */
function localMidnight(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffset(timeZone, guess);
  t = guess - tzOffset(timeZone, t); // second pass settles a DST change between the guess and the answer
  return new Date(t);
}

/** Today's date (YYYY-MM-DD) in `timeZone`. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** [start, end) of a calendar day in `timeZone`. */
export function dayRange(date: string, timeZone: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: localMidnight(date, timeZone), end: localMidnight(nextDate, timeZone) };
}

// ---------------------------------------------------------------------------------------------------------
// student: Entry Pass

export function issueQrToken(who: Who): QrTokenResult {
  const { token, expiresAt } = signQrToken({ sub: String(who.userId), inst: String(who.institutionId) });
  return { token, expiresAt: expiresAt.toISOString(), refreshAfterMs: QR_REFRESH_AFTER_MS };
}

export async function myAttendance(who: Who, q: { limit: number; cursor?: string }): Promise<Page<MyAttendanceItem>> {
  const rows = await AttendanceLogModel.find({ institutionId: who.institutionId, studentId: who.userId, ...afterCursor(q.cursor) })
    .sort({ scannedAt: -1, _id: -1 }).limit(q.limit + 1).lean();
  const page = rows.slice(0, q.limit);
  const names = await namesOf(who.institutionId, page.map((l) => l.scannedBy));
  return {
    items: page.map((l) => ({ scannedAt: l.scannedAt.toISOString(), kind: l.kind, scannedByName: names.get(String(l.scannedBy)) ?? 'Unknown' })),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// warden / admin: scanner and the day's list

export async function scan(ctx: Ctx, token: string, meta: { requestId?: string }): Promise<ScanResult> {
  const claims = verifyQrToken(token);
  if (claims === 'expired') throw errors.validation({ token: 'This QR code has expired. Ask the student to show it again.' }, 'This QR code has expired.');
  if (claims === 'invalid') throw errors.validation({ token: 'This is not a valid SpaceBasic QR code.' }, 'This is not a valid SpaceBasic QR code.');
  // Another institution's pass (or a forged id) looks like "not found": nothing about other tenants leaks.
  if (claims.inst !== String(ctx.institutionId) || !Types.ObjectId.isValid(claims.sub)) throw errors.notFound('No student found for this QR code.');

  const { institutionId } = ctx;
  const student = await UserModel.findOne({ _id: claims.sub, institutionId, status: 'active', roles: 'student' }, { fullName: 1, roomId: 1 }).lean();
  if (!student) throw errors.notFound('No student found for this QR code.');

  const now = new Date();
  const recent = await AttendanceLogModel.exists({ institutionId, studentId: student._id, kind: 'attendance', scannedAt: { $gt: new Date(now.getTime() - RESCAN_WINDOW_MS) } });
  if (recent) throw errors.alreadyScanned(`${student.fullName} was marked a moment ago.`);

  let log;
  try {
    log = await AttendanceLogModel.create({ institutionId, studentId: student._id, scannedBy: ctx.userId, scannedAt: now, kind: 'attendance', jti: claims.jti });
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) throw errors.alreadyScanned(); // the same token again: a replay
    throw err;
  }

  const scanner = await UserModel.findOne({ _id: ctx.userId, institutionId }, { fullName: 1 }).lean();
  await createNotification({ institutionId, userId: student._id, type: 'attendance_marked', body: `Scanned by ${scanner?.fullName ?? 'hostel staff'}.`, refId: log._id });
  await audit({ institutionId, actorId: ctx.userId, action: 'attendance.scan', targetType: 'user', targetId: student._id, meta: { logId: String(log._id) }, requestId: meta.requestId });

  const room = student.roomId ? (await roomDisplays(institutionId, [student.roomId])).get(String(student.roomId)) ?? null : null;
  return { student: { fullName: student.fullName, room }, scannedAt: log.scannedAt.toISOString(), kind: log.kind };
}

/** One calendar day (institution time zone; default today), newest first. */
export async function dayList(ctx: Ctx, q: { limit: number; cursor?: string; date?: string }): Promise<Page<AttendanceItem> & { date: string }> {
  const { institutionId } = ctx;
  const inst = await InstitutionModel.findById(institutionId, { timezone: 1 }).lean();
  const timeZone = inst?.timezone ?? 'Asia/Kolkata';
  const date = q.date ?? todayIn(timeZone);
  const { start, end } = dayRange(date, timeZone);

  const rows = await AttendanceLogModel.find({ institutionId, scannedAt: { $gte: start, $lt: end }, ...afterCursor(q.cursor) })
    .sort({ scannedAt: -1, _id: -1 }).limit(q.limit + 1).lean();
  const page = rows.slice(0, q.limit);
  const students = await UserModel.find({ institutionId, _id: { $in: [...new Set(page.map((l) => String(l.studentId)))] } }, { fullName: 1, roomId: 1 }).lean();
  const studentById = new Map(students.map((s) => [String(s._id), s]));
  const [rooms, scanners] = await Promise.all([
    roomDisplays(institutionId, students.flatMap((s) => (s.roomId ? [s.roomId] : []))),
    namesOf(institutionId, page.map((l) => l.scannedBy)),
  ]);
  return {
    date,
    items: page.map((l) => {
      const s = studentById.get(String(l.studentId));
      return {
        student: { id: String(l.studentId), fullName: s?.fullName ?? 'Unknown' },
        room: s?.roomId ? rooms.get(String(s.roomId)) ?? null : null,
        scannedAt: l.scannedAt.toISOString(),
        kind: l.kind,
        scannedByName: scanners.get(String(l.scannedBy)) ?? 'Unknown',
      };
    }),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null,
  };
}
