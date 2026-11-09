import { Types, type PipelineStage } from 'mongoose';
import {
  roomCodeFor,
  type HostelStructure, type Page, type RoomSummary,
  type createFloorBodySchema, type createHostelBodySchema, type listRoomsQuerySchema,
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
  const [hostels, floors, counts] = await Promise.all([
    HostelModel.find({ institutionId }).sort({ order: 1, code: 1 }).lean(),
    FloorModel.find({ institutionId }).sort({ order: 1, code: 1 }).lean(),
    RoomModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { institutionId } },
      { $group: { _id: '$floorId', n: { $sum: 1 } } },
    ]),
  ]);
  const roomCount = new Map(counts.map((c) => [String(c._id), c.n]));
  return hostels.map((h) => ({
    hostel: { name: h.name, code: h.code, order: h.order },
    floors: floors
      .filter((f) => f.hostelId.equals(h._id))
      .map((f) => ({
        code: f.code, name: f.name, order: f.order, roomNumberMin: f.roomNumberMin, roomNumberMax: f.roomNumberMax,
        bedsPerRoom: f.bedsPerRoom, roomCount: roomCount.get(String(f._id)) ?? 0,
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
