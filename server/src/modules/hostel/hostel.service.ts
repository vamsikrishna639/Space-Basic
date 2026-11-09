import { Types, type PipelineStage } from 'mongoose';
import {
  roomCodeFor,
  type CreateRoomRangeResult, type DeleteRoomRangeResult, type HostelStructure, type Page, type RoomBlocker, type RoomSummary,
  type createFloorBodySchema, type createHostelBodySchema, type createRoomRangeBodySchema, type deleteRoomRangeBodySchema,
  type listRoomsQuerySchema,
} from '@spacebasic/shared';
import type { z } from 'zod';
import { errors } from '../../core/http/errors';
import { audit } from '../../core/audit/audit';
import { UserModel } from '../users/user.model';
import { FloorModel, HostelModel, RoomModel, type Floor, type Hostel, type Room } from './hostel.models';
import { activeOccupants, revIs } from './beds';

// Hostel -> Floor -> Room (docs/schemas.md §1.7, docs/api.md "Hostel"). Everything is scoped by the caller's
// institutionId. Floor codes are unique across the institution (not only per hostel) because room codes,
// which start with the floor code, are unique per institution (decisions.md).

type Ctx = Express.AuthContext;
interface Meta { requestId?: string }

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

async function hostelByCode(institutionId: Types.ObjectId, code: string): Promise<Hostel> {
  const hostel = await HostelModel.findOne({ institutionId, code }).lean();
  if (!hostel) throw errors.notFound(`There is no hostel ${code}.`);
  return hostel;
}

/** Active users per room, for the given rooms only. */
async function occupancy(institutionId: Types.ObjectId, roomIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (!roomIds.length) return new Map();
  const rows = await UserModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { institutionId, roomId: { $in: roomIds }, status: 'active' } },
    { $group: { _id: '$roomId', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

// ---------------------------------------------------------------------------------------------------------
// reads

export async function structure(ctx: Ctx): Promise<HostelStructure[]> {
  const { institutionId } = ctx;
  const [hostels, floors, counts, held] = await Promise.all([
    HostelModel.find({ institutionId }).sort({ order: 1, code: 1 }).lean(),
    FloorModel.find({ institutionId }).sort({ order: 1, code: 1 }).lean(),
    RoomModel.aggregate<{ _id: Types.ObjectId; n: number; beds: number }>([
      { $match: { institutionId } },
      { $group: { _id: '$floorId', n: { $sum: 1 }, beds: { $sum: '$beds' } } },
    ]),
    // Beds held per floor: active users with a room (a disabled user keeps the room but not the bed).
    UserModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { institutionId, status: 'active', roomId: { $ne: null } } },
      {
        $lookup: {
          from: RoomModel.collection.collectionName, localField: 'roomId', foreignField: '_id', as: 'room',
          pipeline: [{ $match: { institutionId } }, { $project: { floorId: 1 } }],
        },
      },
      { $unwind: '$room' },
      { $group: { _id: '$room.floorId', n: { $sum: 1 } } },
    ]),
  ]);
  const rooms = new Map(counts.map((c) => [String(c._id), c]));
  const occupied = new Map(held.map((c) => [String(c._id), c.n]));
  return hostels.map((h) => ({
    hostel: { name: h.name, code: h.code, order: h.order },
    floors: floors
      .filter((f) => f.hostelId.equals(h._id))
      .map((f) => ({
        code: f.code, name: f.name, order: f.order, roomNumberMin: f.roomNumberMin, roomNumberMax: f.roomNumberMax,
        bedsPerRoom: f.bedsPerRoom, roomCount: rooms.get(String(f._id))?.n ?? 0,
        beds: rooms.get(String(f._id))?.beds ?? 0, occupied: occupied.get(String(f._id)) ?? 0,
      })),
  }));
}

function decodeCursor(cursor: string): string {
  const code = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^[A-Z]{2}\d{3}$/.test(code)) throw errors.validation({ cursor: 'Invalid cursor' });
  return code;
}

export async function listRooms(ctx: Ctx, q: z.output<typeof listRoomsQuerySchema>): Promise<Page<RoomSummary>> {
  const { institutionId } = ctx;
  const filter: Record<string, unknown> = { institutionId };
  if (q.hostel) filter.hostelId = (await hostelByCode(institutionId, q.hostel))._id;
  if (q.floor) {
    const floor = await FloorModel.findOne({ institutionId, code: q.floor }, { _id: 1 }).lean();
    if (!floor) throw errors.notFound(`There is no floor ${q.floor}.`);
    filter.floorId = floor._id;
  }
  const code: Record<string, unknown> = {};
  if (q.q) code.$regex = `^${q.q}`; // the schema allows only letters and digits
  if (q.cursor) code.$gt = decodeCursor(q.cursor);
  if (Object.keys(code).length) filter.code = code;

  // `free`: the room picker. Occupants are counted in the database so the page holds `limit` rooms with a free bed.
  const pipeline: PipelineStage[] = [{ $match: filter }, { $sort: { code: 1 } }];
  if (q.free) {
    pipeline.push(
      {
        $lookup: {
          from: UserModel.collection.collectionName, localField: '_id', foreignField: 'roomId', as: 'occupied',
          pipeline: [{ $match: { institutionId, status: 'active' } }, { $project: { _id: 1 } }],
        },
      },
      { $match: { $expr: { $lt: [{ $size: '$occupied' }, '$beds'] } } },
      { $project: { occupied: 0 } },
    );
  }
  pipeline.push({ $limit: q.limit + 1 });
  const rows = await RoomModel.aggregate<Room>(pipeline);
  const page = rows.slice(0, q.limit);
  const [occupied, floors, hostels] = await Promise.all([
    occupancy(institutionId, page.map((r) => r._id)),
    FloorModel.find({ institutionId, _id: { $in: [...new Set(page.map((r) => String(r.floorId)))] } }, { code: 1 }).lean(),
    HostelModel.find({ institutionId, _id: { $in: [...new Set(page.map((r) => String(r.hostelId)))] } }, { code: 1 }).lean(),
  ]);
  const floorCode = new Map(floors.map((f) => [String(f._id), f.code]));
  const hostelCode = new Map(hostels.map((h) => [String(h._id), h.code]));
  return {
    items: page.map((r) => ({
      code: r.code, number: r.number, beds: r.beds,
      floorCode: floorCode.get(String(r.floorId)) ?? '', hostelCode: hostelCode.get(String(r.hostelId)) ?? '',
      occupants: occupied.get(String(r._id)) ?? 0,
    })),
    nextCursor: rows.length > q.limit ? Buffer.from(page[page.length - 1]!.code).toString('base64url') : null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// writes (hostel:manage)

export async function createHostel(ctx: Ctx, body: z.output<typeof createHostelBodySchema>, meta: Meta) {
  const { institutionId } = ctx;
  try {
    const order = body.order ?? (await HostelModel.countDocuments({ institutionId })) + 1;
    const hostel = await HostelModel.create({ institutionId, name: body.name, code: body.code, order });
    await audit({ institutionId, actorId: ctx.userId, action: 'hostel.create', targetType: 'hostel', targetId: hostel._id, meta: { code: hostel.code }, requestId: meta.requestId });
    return { name: hostel.name, code: hostel.code, order: hostel.order };
  } catch (err) {
    if (isDuplicateKey(err)) throw errors.conflict(`Hostel ${body.code} already exists.`, { code: 'Already in use' });
    throw err;
  }
}

export async function createFloor(ctx: Ctx, body: z.output<typeof createFloorBodySchema>, meta: Meta) {
  const { institutionId } = ctx;
  const hostel = await hostelByCode(institutionId, body.hostelCode);
  // Room codes (floor code + number) are unique per institution, so the floor code must be too.
  if (await FloorModel.exists({ institutionId, code: body.code })) {
    throw errors.conflict(`Floor ${body.code} already exists.`, { code: 'Already in use in this institution' });
  }
  try {
    const order = body.order ?? (await FloorModel.countDocuments({ institutionId, hostelId: hostel._id })) + 1;
    const floor = await FloorModel.create({
      institutionId, hostelId: hostel._id, code: body.code, name: body.name, order,
      roomNumberMin: body.roomNumberMin, roomNumberMax: body.roomNumberMax, bedsPerRoom: body.bedsPerRoom,
    });
    await audit({ institutionId, actorId: ctx.userId, action: 'floor.create', targetType: 'floor', targetId: floor._id, meta: { hostel: hostel.code, code: floor.code, range: [floor.roomNumberMin, floor.roomNumberMax] }, requestId: meta.requestId });
    return {
      hostelCode: hostel.code, code: floor.code, name: floor.name, order: floor.order,
      roomNumberMin: floor.roomNumberMin, roomNumberMax: floor.roomNumberMax, bedsPerRoom: floor.bedsPerRoom, roomCount: 0,
    };
  } catch (err) {
    if (isDuplicateKey(err)) throw errors.conflict(`Floor ${body.code} already exists.`, { code: 'Already in use in this institution' });
    throw err;
  }
}

/** Create every room in the floor's number range that doesn't exist yet. Safe to repeat. */
export async function generateRooms(ctx: Ctx, floorCode: string, hostelCode: string, meta: Meta): Promise<{ created: number }> {
  const { institutionId } = ctx;
  const hostel = await hostelByCode(institutionId, hostelCode);
  const floor: Floor | null = await FloorModel.findOne({ institutionId, hostelId: hostel._id, code: floorCode }).lean();
  if (!floor) throw errors.notFound(`There is no floor ${floorCode} in hostel ${hostelCode}.`);

  const existing = new Set(
    (await RoomModel.find({ institutionId, floorId: floor._id }, { number: 1 }).lean()).map((r) => r.number),
  );
  const missing = [];
  for (let n = floor.roomNumberMin; n <= floor.roomNumberMax; n++) {
    if (!existing.has(n)) {
      missing.push({ institutionId, hostelId: hostel._id, floorId: floor._id, number: n, code: roomCodeFor(floor.code, n), beds: floor.bedsPerRoom });
    }
  }
  let created = 0;
  if (missing.length) {
    try {
      created = (await RoomModel.insertMany(missing, { ordered: false })).length;
    } catch (err) {
      // A concurrent generate created some of them first: count what this call inserted, ignore the duplicates.
      const e = err as { code?: number; insertedDocs?: unknown[]; writeErrors?: { code?: number }[] };
      if (!(e.writeErrors ?? []).every((w) => w.code === 11000) && !isDuplicateKey(err)) throw err;
      created = e.insertedDocs?.length ?? 0;
    }
  }
  if (created) {
    await audit({ institutionId, actorId: ctx.userId, action: 'rooms.generate', targetType: 'floor', targetId: floor._id, meta: { floor: floor.code, created }, requestId: meta.requestId });
  }
  return { created };
}

export async function updateRoom(ctx: Ctx, code: string, beds: number, meta: Meta): Promise<RoomSummary> {
  const { institutionId } = ctx;
  const room = await RoomModel.findOne({ institutionId, code });
  if (!room) throw errors.notFound(`There is no room ${code}.`);
  const occupants = await activeOccupants(institutionId, room._id);
  if (beds < occupants) {
    throw errors.conflict(`Room ${code} has ${occupants} occupants.`, { beds: `At least ${occupants}: the room has ${occupants} occupants` });
  }
  const from = room.beds;
  if (from !== beds) {
    // Same revision rule as filling a bed (beds.ts): a user placed in the room after the count above makes this fail.
    const saved = await RoomModel.updateOne({ institutionId, _id: room._id, rev: revIs(room.rev) }, { $set: { beds }, $inc: { rev: 1 } });
    if (saved.modifiedCount !== 1) throw errors.conflict(`Room ${code} changed while saving. Try again.`);
    room.beds = beds;
    await audit({ institutionId, actorId: ctx.userId, action: 'room.update', targetType: 'room', targetId: room._id, meta: { code, beds: { from, to: beds } }, requestId: meta.requestId });
  }
  const [floor, hostel] = await Promise.all([
    FloorModel.findOne({ institutionId, _id: room.floorId }, { code: 1 }).lean(),
    HostelModel.findOne({ institutionId, _id: room.hostelId }, { code: 1 }).lean(),
  ]);
  return { code: room.code, number: room.number, beds: room.beds, floorCode: floor?.code ?? '', hostelCode: hostel?.code ?? '', occupants };
}

// ---------------------------------------------------------------------------------------------------------
// rooms by range, deleting (Admin > Hostel; decisions.md 2026-11-09)

const codesOf = (rooms: { code: string }[]) => rooms.map((r) => r.code);

/** Create the rooms `floorCode` + `from`..`to` that don't exist yet, creating the floor first if it's new. */
export async function createRoomRange(ctx: Ctx, body: z.output<typeof createRoomRangeBodySchema>, meta: Meta): Promise<CreateRoomRangeResult> {
  const { institutionId } = ctx;
  const hostel = await hostelByCode(institutionId, body.hostelCode);
  let floor: Floor | null = await FloorModel.findOne({ institutionId, code: body.floorCode }).lean();
  if (floor && !floor.hostelId.equals(hostel._id)) {
    const other = await HostelModel.findOne({ institutionId, _id: floor.hostelId }, { name: 1 }).lean();
    const where = other?.name ?? 'another block';
    throw errors.conflict(`Floor ${body.floorCode} is in block ${where}.`, { floorCode: `Already used in block ${where}` });
  }
  if (!floor && !body.floorName) throw errors.validation({ floorName: 'Name the new floor, for example First floor' });

  const numbers = Array.from({ length: body.to - body.from + 1 }, (_, i) => body.from + i);
  const inRange = floor
    ? await RoomModel.find({ institutionId, floorId: floor._id, number: { $gte: body.from, $lte: body.to } }, { number: 1 }).lean()
    : [];
  const existing = new Set(inRange.map((r) => r.number));
  const missing = numbers.filter((n) => !existing.has(n));
  const floorInfo = { code: body.floorCode, name: floor?.name ?? body.floorName!, isNew: !floor };
  if (body.dryRun) {
    return {
      dryRun: true,
      floor: floorInfo,
      created: missing.map((n) => roomCodeFor(body.floorCode, n)),
      skipped: numbers.filter((n) => existing.has(n)).map((n) => roomCodeFor(body.floorCode, n)),
      beds: missing.length * body.beds,
    };
  }

  if (!floor) {
    try {
      const order = (await FloorModel.countDocuments({ institutionId, hostelId: hostel._id })) + 1;
      const made = await FloorModel.create({
        institutionId, hostelId: hostel._id, code: body.floorCode, name: body.floorName!, order,
        roomNumberMin: body.from, roomNumberMax: body.to, bedsPerRoom: body.beds,
      });
      floor = made.toObject();
      await audit({
        institutionId, actorId: ctx.userId, action: 'floor.create', targetType: 'floor', targetId: made._id,
        meta: { hostel: hostel.code, code: made.code, name: made.name }, requestId: meta.requestId,
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw errors.conflict(`Floor ${body.floorCode} was just created by someone else. Check the preview again.`);
      throw err;
    }
  }
  const floorId = floor._id;
  const docs = missing.map((n) => ({ institutionId, hostelId: hostel._id, floorId, number: n, code: roomCodeFor(body.floorCode, n), beds: body.beds }));
  let created: string[] = [];
  if (docs.length) {
    try {
      created = codesOf(await RoomModel.insertMany(docs, { ordered: false }));
    } catch (err) {
      // Another request created some of them first: keep what this one inserted, the rest already exist.
      const e = err as { insertedDocs?: { code: string }[]; writeErrors?: { code?: number }[] };
      if (!(e.writeErrors ?? []).every((w) => w.code === 11000) && !isDuplicateKey(err)) throw err;
      created = codesOf(e.insertedDocs ?? []);
    }
  }
  if (created.length) {
    await FloorModel.updateOne(
      { institutionId, _id: floorId },
      { $min: { roomNumberMin: body.from }, $max: { roomNumberMax: body.to }, $set: { bedsPerRoom: body.beds } },
    );
    await audit({
      institutionId, actorId: ctx.userId, action: 'rooms.create', targetType: 'floor', targetId: floorId,
      meta: { floor: body.floorCode, from: body.from, to: body.to, beds: body.beds, created: created.length, skipped: numbers.length - created.length },
      requestId: meta.requestId,
    });
  }
  const made = new Set(created);
  return {
    dryRun: false,
    floor: floorInfo,
    created: numbers.map((n) => roomCodeFor(body.floorCode, n)).filter((c) => made.has(c)),
    skipped: numbers.map((n) => roomCodeFor(body.floorCode, n)).filter((c) => !made.has(c)),
    beds: created.length * body.beds,
  };
}

/** Who is assigned to these rooms (any status: a disabled user keeps the room), per room in code order. */
async function blockersOf(institutionId: Types.ObjectId, rooms: Room[]): Promise<RoomBlocker[]> {
  if (!rooms.length) return [];
  const users = await UserModel.find({ institutionId, roomId: { $in: rooms.map((r) => r._id) } }, { fullName: 1, status: 1, roomId: 1 })
    .sort({ fullName: 1 })
    .lean();
  const byRoom = new Map<string, RoomBlocker['users']>();
  for (const u of users) {
    const key = String(u.roomId);
    byRoom.set(key, [...(byRoom.get(key) ?? []), { id: String(u._id), fullName: u.fullName, status: u.status }]);
  }
  return rooms
    .filter((r) => byRoom.has(String(r._id)))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((r) => ({ code: r.code, users: byRoom.get(String(r._id))! }));
}

function blockedMessage(blocked: RoomBlocker[]): string {
  const who = (b: RoomBlocker) => b.users.map((u) => (u.status === 'disabled' ? `${u.fullName} (disabled)` : u.fullName)).join(', ');
  if (blocked.length === 1) {
    const b = blocked[0]!;
    return `Room ${b.code} has ${b.users.length === 1 ? 'someone' : `${b.users.length} people`} assigned: ${who(b)}. Move them to another room first.`;
  }
  const list = blocked.slice(0, 5).map((b) => `${b.code}: ${who(b)}`).join('; ');
  return `${blocked.length} rooms have people assigned (${list}${blocked.length > 5 ? '; …' : ''}). Move them to other rooms first.`;
}

/** Keep the floor's stored range on its rooms after a delete (unchanged when none are left). */
async function refreshFloorRange(institutionId: Types.ObjectId, floorId: Types.ObjectId) {
  const [span] = await RoomModel.aggregate<{ min: number; max: number }>([
    { $match: { institutionId, floorId } },
    { $group: { _id: null, min: { $min: '$number' }, max: { $max: '$number' } } },
  ]);
  if (span) await FloorModel.updateOne({ institutionId, _id: floorId }, { $set: { roomNumberMin: span.min, roomNumberMax: span.max } });
}

/**
 * Delete rooms nobody is assigned to. While any of them has someone assigned, nothing is deleted (409, or the list
 * in a dry run). Each delete is a compare-and-set on the room's revision (beds.ts): a user placed in the room after
 * the check bumps it, so that room is checked again and kept if it now has someone.
 */
async function deleteRooms(ctx: Ctx, rooms: Room[], dryRun: boolean): Promise<DeleteRoomRangeResult> {
  const { institutionId } = ctx;
  const blocked = await blockersOf(institutionId, rooms);
  if (dryRun) return { dryRun, deleted: blocked.length ? [] : codesOf(rooms), blocked };
  if (blocked.length) throw errors.conflict(blockedMessage(blocked));

  const deleted: string[] = [];
  const late: RoomBlocker[] = [];
  for (const first of rooms) {
    let room = first;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await RoomModel.deleteOne({ institutionId, _id: room._id, rev: revIs(room.rev) });
      if (res.deletedCount === 1) { deleted.push(room.code); break; }
      const fresh: Room | null = await RoomModel.findOne({ institutionId, _id: room._id }).lean();
      if (!fresh) break; // deleted by another request
      const now = await blockersOf(institutionId, [fresh]);
      if (now.length) { late.push(...now); break; }
      room = fresh;
    }
  }
  return { dryRun, deleted, blocked: late };
}

export async function deleteRoomRange(ctx: Ctx, body: z.output<typeof deleteRoomRangeBodySchema>, meta: Meta): Promise<DeleteRoomRangeResult> {
  const { institutionId } = ctx;
  const floor = await FloorModel.findOne({ institutionId, code: body.floorCode }).lean();
  if (!floor) throw errors.notFound(`There is no floor ${body.floorCode}.`);
  const rooms: Room[] = await RoomModel.find({ institutionId, floorId: floor._id, number: { $gte: body.from, $lte: body.to } }).sort({ number: 1 }).lean();
  const result = await deleteRooms(ctx, rooms, body.dryRun);
  if (!body.dryRun && result.deleted.length) {
    await refreshFloorRange(institutionId, floor._id);
    await audit({
      institutionId, actorId: ctx.userId, action: 'rooms.delete', targetType: 'floor', targetId: floor._id,
      meta: { floor: floor.code, from: body.from, to: body.to, deleted: result.deleted.length, rooms: result.deleted, kept: codesOf(result.blocked) },
      requestId: meta.requestId,
    });
  }
  return result;
}

export async function deleteRoom(ctx: Ctx, code: string, meta: Meta): Promise<DeleteRoomRangeResult> {
  const { institutionId } = ctx;
  const room: Room | null = await RoomModel.findOne({ institutionId, code }).lean();
  if (!room) throw errors.notFound(`There is no room ${code}.`);
  const result = await deleteRooms(ctx, [room], false);
  if (result.blocked.length) throw errors.conflict(blockedMessage(result.blocked));
  if (result.deleted.length) {
    await refreshFloorRange(institutionId, room.floorId);
    await audit({
      institutionId, actorId: ctx.userId, action: 'room.delete', targetType: 'room', targetId: room._id,
      meta: { code: room.code, beds: room.beds }, requestId: meta.requestId,
    });
  }
  return result;
}

/** Delete a floor that has no rooms left (a mistyped prefix, for example). */
export async function deleteFloor(ctx: Ctx, code: string, meta: Meta): Promise<void> {
  const { institutionId } = ctx;
  const floor = await FloorModel.findOne({ institutionId, code }).lean();
  if (!floor) throw errors.notFound(`There is no floor ${code}.`);
  const rooms = await RoomModel.countDocuments({ institutionId, floorId: floor._id });
  if (rooms) throw errors.conflict(`Floor ${code} still has ${rooms} room${rooms === 1 ? '' : 's'}. Delete them first.`);
  await FloorModel.deleteOne({ institutionId, _id: floor._id });
  // Rooms added by a request that raced this one would be left without a floor: put the floor back.
  if (await RoomModel.exists({ institutionId, floorId: floor._id })) {
    await FloorModel.create(floor);
    throw errors.conflict(`Rooms were just added to floor ${code}, so it was kept.`);
  }
  await audit({
    institutionId, actorId: ctx.userId, action: 'floor.delete', targetType: 'floor', targetId: floor._id,
    meta: { code: floor.code, name: floor.name }, requestId: meta.requestId,
  });
}
