import { Types } from 'mongoose';
import {
  createUserBodySchema, hasPermission, roomDisplay, ROOM_CODE_PATTERN,
  type ImportUsersResult, type Page, type Role, type UserSummary,
  type assignRolesBodySchema, type listUsersQuerySchema, type updateUserBodySchema,
} from '@spacebasic/shared';
import type { z } from 'zod';
import { AppError, errors } from '../../core/http/errors';
import { audit } from '../../core/audit/audit';
import { hashPassword } from '../../core/security/password';
import { HostelModel, RoomModel } from '../hostel/hostel.models';
import { withFreeBed } from '../hostel/beds';
import { revokeAllSessions } from '../auth/auth.service';
import { UserModel, type User } from './user.model';

// Admin user management (docs/api.md "Users and profile"; RBAC in docs/architecture.md §5).
// Every query is scoped by the caller's institutionId, which comes from the verified token.

type Ctx = Express.AuthContext;
interface Meta { requestId?: string }

const isSuperAdmin = (ctx: Ctx) => ctx.roles.includes('super_admin');
/** Wardens can read users but not manage them; they only ever see students (architecture.md §5). */
const studentsOnly = (ctx: Ctx) => !hasPermission(ctx.roles, 'users:update');

// ---------------------------------------------------------------------------------------------------------
// summaries

async function toSummaries(institutionId: Types.ObjectId, users: (User & { passwordHash?: string | null })[]): Promise<UserSummary[]> {
  const roomIds = [...new Set(users.map((u) => u.roomId).filter((id): id is Types.ObjectId => !!id).map(String))];
  const rooms = roomIds.length ? await RoomModel.find({ institutionId, _id: { $in: roomIds } }).lean() : [];
  const hostelIds = [...new Set(rooms.map((r) => String(r.hostelId)))];
  const hostels = hostelIds.length ? await HostelModel.find({ institutionId, _id: { $in: hostelIds } }).lean() : [];
  const roomById = new Map(rooms.map((r) => [String(r._id), r]));
  const hostelName = new Map(hostels.map((h) => [String(h._id), h.name]));
  return users.map((u) => {
    const room = u.roomId ? roomById.get(String(u.roomId)) : undefined;
    const hostel = room ? hostelName.get(String(room.hostelId)) : undefined;
    return {
      id: String(u._id),
      fullName: u.fullName,
      email: u.email ?? null,
      phone: u.phone ?? null,
      roles: u.roles,
      status: u.status,
      room: room && hostel ? { code: room.code, display: roomDisplay(hostel, room.code) } : null,
      hasAvatar: !!u.avatar,
      hasPassword: !!u.passwordHash,
      createdAt: u.createdAt.toISOString(),
    };
  });
}

async function summaryOf(institutionId: Types.ObjectId, userId: Types.ObjectId): Promise<UserSummary> {
  const u = await UserModel.findOne({ _id: userId, institutionId }).select('+passwordHash').lean();
  if (!u) throw errors.notFound();
  return (await toSummaries(institutionId, [u]))[0]!;
}

/** One user, as the list shows them. Users the caller can't list (platform staff; non-students for wardens) are 404. */
export async function getUser(ctx: Ctx, id: string): Promise<UserSummary> {
  const u = await UserModel.findOne({ _id: id, institutionId: ctx.institutionId }).select('+passwordHash').lean();
  if (!u) throw errors.notFound();
  if (u.roles.includes('super_admin') && !isSuperAdmin(ctx)) throw errors.notFound();
  if (studentsOnly(ctx) && !u.roles.includes('student')) throw errors.notFound();
  return (await toSummaries(ctx.institutionId, [u]))[0]!;
}

// ---------------------------------------------------------------------------------------------------------
// list

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function decodeCursor(cursor: string): { n: string; i: Types.ObjectId } {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { n?: unknown; i?: unknown };
    if (typeof v.n === 'string' && typeof v.i === 'string' && Types.ObjectId.isValid(v.i)) return { n: v.n, i: new Types.ObjectId(v.i) };
  } catch { /* fall through */ }
  throw errors.validation({ cursor: 'Invalid cursor' });
}
const encodeCursor = (u: Pick<User, 'fullName' | '_id'>) => Buffer.from(JSON.stringify({ n: u.fullName, i: String(u._id) })).toString('base64url');

export async function listUsers(ctx: Ctx, q: z.output<typeof listUsersQuerySchema>): Promise<Page<UserSummary>> {
  const { institutionId } = ctx;
  const and: Record<string, unknown>[] = [];

  // Which roles the caller may see.
  if (studentsOnly(ctx)) {
    if (q.role && q.role !== 'student') throw errors.forbidden('You can only list students.');
    and.push({ roles: 'student' });
  } else if (q.role) {
    if (q.role === 'super_admin' && !isSuperAdmin(ctx)) throw errors.forbidden();
    and.push({ roles: q.role });
  }
  if (!isSuperAdmin(ctx)) and.push({ roles: { $ne: 'super_admin' } }); // platform staff stay out of institution lists

  if (q.status) and.push({ status: q.status });
  if (q.room === 'none') and.push({ roomId: null }); // null or missing
  if (q.room === 'assigned') and.push({ roomId: { $ne: null } });
  if (q.q) {
    const text = escapeRegex(q.q);
    const or: Record<string, unknown>[] = [{ fullName: { $regex: text, $options: 'i' } }, { email: { $regex: `^${text}`, $options: 'i' } }];
    const digits = q.q.replace(/\D/g, '');
    if (digits.length >= 3) or.push({ phone: { $regex: escapeRegex(digits) } });
    const code = q.q.toUpperCase();
    if (ROOM_CODE_PATTERN.test(code)) {
      const room = await RoomModel.findOne({ institutionId, code }, { _id: 1 }).lean();
      if (room) or.push({ roomId: room._id });
    }
    and.push({ $or: or });
  }
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    and.push({ $or: [{ fullName: { $gt: c.n } }, { fullName: c.n, _id: { $gt: c.i } }] });
  }

  const rows = await UserModel.find({ institutionId, ...(and.length ? { $and: and } : {}) })
    .select('+passwordHash')
    .sort({ fullName: 1, _id: 1 })
    .limit(q.limit + 1)
    .lean();
  const page = rows.slice(0, q.limit);
  return {
    items: await toSummaries(institutionId, page),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// shared checks

function assertCanGrant(ctx: Ctx, roles: readonly Role[]): void {
  if (roles.includes('super_admin') && !isSuperAdmin(ctx)) throw errors.forbidden('Only SpaceBasic staff can grant super_admin.');
}

/** Email and phone are unique across ALL institutions (decisions.md), so this check is deliberately unscoped. */
async function assertIdentifiersFree(email: string | null | undefined, phone: string | null | undefined, exceptUserId?: Types.ObjectId): Promise<void> {
  const fields: Record<string, string> = {};
  for (const [field, value] of [['email', email], ['phone', phone]] as const) {
    if (!value) continue;
    const filter: Record<string, unknown> = { [field]: value };
    if (exceptUserId) filter._id = { $ne: exceptUserId };
    const taken = await UserModel.exists(filter).setOptions({ unscoped: 'users: global uniqueness of email/phone' });
    if (taken) fields[field] = field === 'email' ? 'This email is already in use' : 'This mobile number is already in use';
  }
  if (Object.keys(fields).length) throw errors.conflict('That email or mobile number is already in use.', fields);
}

/** A unique-index race between the check above and the write still ends as a clean 409. */
function duplicateKeyToConflict(err: unknown): never {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (e?.code === 11000) {
    const field = Object.keys(e.keyPattern ?? {})[0] ?? 'email';
    throw errors.conflict('That email or mobile number is already in use.', { [field]: 'Already in use' });
  }
  throw err;
}

// ---------------------------------------------------------------------------------------------------------
// create / import

async function createOne(ctx: Ctx, body: z.output<typeof createUserBodySchema>): Promise<User> {
  const { institutionId } = ctx;
  assertCanGrant(ctx, body.roles);
  await assertIdentifiersFree(body.email, body.phone);
  const passwordHash = body.password ? await hashPassword(body.password) : null;
  const insert = async (roomId: Types.ObjectId | null): Promise<User> => {
    try {
      return await UserModel.create({ institutionId, fullName: body.fullName, email: body.email, phone: body.phone, passwordHash, roles: body.roles, roomId });
    } catch (err) {
      return duplicateKeyToConflict(err);
    }
  };
  if (!body.roomCode) return insert(null);
  return withFreeBed(institutionId, body.roomCode, undefined, async (room) => {
    const user = await insert(room._id);
    return { result: user, undo: async () => { await UserModel.deleteOne({ institutionId, _id: user._id }); } };
  });
}

export async function createUser(ctx: Ctx, body: z.output<typeof createUserBodySchema>, meta: Meta): Promise<UserSummary> {
  const user = await createOne(ctx, body);
  await audit({ institutionId: ctx.institutionId, actorId: ctx.userId, action: 'user.create', targetType: 'user', targetId: user._id, meta: { roles: user.roles }, requestId: meta.requestId });
  return summaryOf(ctx.institutionId, user._id);
}

function reasonOf(err: unknown): string {
  if (err instanceof AppError) {
    const fields = err.fields ? Object.entries(err.fields).map(([k, v]) => `${k}: ${v}`) : [];
    return fields.length ? fields.join('; ') : err.message;
  }
  throw err; // unexpected errors fail the request (500) rather than being reported as a skipped row
}

/** Rows run one at a time so room-capacity and duplicate checks see the rows created before them. */
export async function importUsers(ctx: Ctx, rows: Record<string, unknown>[], meta: Meta): Promise<ImportUsersResult> {
  const result: ImportUsersResult = { created: 0, skipped: [] };
  for (const [index, row] of rows.entries()) {
    const parsed = createUserBodySchema.safeParse(row);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      result.skipped.push({ row: index + 1, reason: `${issue.path.length ? issue.path.join('.') + ': ' : ''}${issue.message}` });
      continue;
    }
    try {
      await createOne(ctx, parsed.data);
      result.created++;
    } catch (err) {
      result.skipped.push({ row: index + 1, reason: reasonOf(err) });
    }
  }
  await audit({
    institutionId: ctx.institutionId, actorId: ctx.userId, action: 'user.import', targetType: 'institution', targetId: ctx.institutionId,
    meta: { rows: rows.length, created: result.created, skipped: result.skipped.length }, requestId: meta.requestId,
  });
  return result;
}

// ---------------------------------------------------------------------------------------------------------
// update / roles

async function loadManagedUser(ctx: Ctx, id: string) {
  const user = await UserModel.findOne({ _id: id, institutionId: ctx.institutionId });
  if (!user) throw errors.notFound();
  if (user.roles.includes('super_admin') && !isSuperAdmin(ctx)) throw errors.forbidden();
  return user;
}

type UserFields = Pick<User, 'fullName' | 'status'> & { email: string | null; phone: string | null; roomId: Types.ObjectId | null };

export async function updateUser(ctx: Ctx, id: string, body: z.output<typeof updateUserBodySchema>, meta: Meta): Promise<UserSummary> {
  const { institutionId } = ctx;
  const user = await loadManagedUser(ctx, id);
  const self = user._id.equals(ctx.userId);
  if (self && body.status === 'disabled') throw errors.forbidden("You can't disable your own account.");

  const nextEmail = body.email === undefined ? user.email : body.email;
  const nextPhone = body.phone === undefined ? user.phone : body.phone;
  if (!nextEmail && !nextPhone) throw errors.validation({ email: 'Give an email or a mobile number' });
  await assertIdentifiersFree(
    body.email !== undefined && body.email !== user.email ? body.email : undefined,
    body.phone !== undefined && body.phone !== user.phone ? body.phone : undefined,
    user._id,
  );

  const before: UserFields = {
    fullName: user.fullName, status: user.status, email: user.email ?? null, phone: user.phone ?? null, roomId: user.roomId ?? null,
  };
  const set: Partial<UserFields> = {};
  if (body.fullName !== undefined && body.fullName !== before.fullName) set.fullName = body.fullName;
  if (body.email !== undefined && body.email !== before.email) set.email = body.email;
  if (body.phone !== undefined && body.phone !== before.phone) set.phone = body.phone;
  if (body.status !== undefined && body.status !== before.status) set.status = body.status;

  // A bed to take: a new room, or the user's own room again when they're enabled (a disabled user keeps the room
  // but not the bed, which someone else may have taken since).
  let claim: string | null = null;
  if (body.roomCode === null) {
    if (before.roomId) set.roomId = null;
  } else if (body.roomCode !== undefined) {
    if (!user.roles.includes('student')) throw errors.validation({ roomCode: 'Only students have a room' });
    claim = body.roomCode;
  } else if (set.status === 'active' && before.roomId) {
    claim = (await RoomModel.findOne({ institutionId, _id: before.roomId }, { code: 1 }).lean())?.code ?? null;
  }

  const write = async (values: Partial<UserFields>) => {
    if (!Object.keys(values).length) return;
    try {
      await UserModel.updateOne({ institutionId, _id: user._id }, { $set: values }, { runValidators: true });
    } catch (err) {
      duplicateKeyToConflict(err);
    }
  };
  if (claim) {
    await withFreeBed(institutionId, claim, user._id, async (room) => {
      if (!before.roomId?.equals(room._id)) set.roomId = room._id;
      await write(set);
      const undo = Object.fromEntries(Object.keys(set).map((k) => [k, before[k as keyof UserFields]])) as Partial<UserFields>;
      return { result: undefined, undo: () => write(undo) };
    });
  } else {
    await write(set);
  }

  const changed = Object.keys(set).map((k) => (k === 'roomId' ? 'room' : k));
  if (changed.length) {
    await audit({ institutionId, actorId: ctx.userId, action: 'user.update', targetType: 'user', targetId: user._id, meta: { fields: changed }, requestId: meta.requestId });
  }
  if (set.status) {
    // Disabling takes effect at once: authenticate() checks the status on every request and every session is revoked.
    if (set.status === 'disabled') await revokeAllSessions({ institutionId, userId: user._id }, 'disabled');
    await audit({ institutionId, actorId: ctx.userId, action: set.status === 'disabled' ? 'user.disable' : 'user.enable', targetType: 'user', targetId: user._id, requestId: meta.requestId });
  }
  return summaryOf(institutionId, user._id);
}

export async function assignRoles(ctx: Ctx, id: string, body: z.output<typeof assignRolesBodySchema>, meta: Meta): Promise<UserSummary> {
  const user = await loadManagedUser(ctx, id);
  if (user._id.equals(ctx.userId)) throw errors.forbidden("You can't change your own roles.");
  assertCanGrant(ctx, body.roles);

  const from: Role[] = [...user.roles];
  const to: Role[] = body.roles;
  if (from.length !== to.length || from.some((r) => !to.includes(r))) {
    user.roles = to;
    const leftRoom = !to.includes('student') && !!user.roomId;
    if (leftRoom) user.roomId = null; // only students have a room
    await user.save();
    await audit({ institutionId: ctx.institutionId, actorId: ctx.userId, action: 'user.role_change', targetType: 'user', targetId: user._id, meta: { from, to, leftRoom }, requestId: meta.requestId });
  }
  // Roles are read from the database on every request (authenticate), so the change applies immediately.
  return summaryOf(ctx.institutionId, user._id);
}
