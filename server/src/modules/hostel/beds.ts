import type { Types } from 'mongoose';
import { errors } from '../../core/http/errors';
import { UserModel } from '../users/user.model';
import { RoomModel, type Room } from './hostel.models';

// Bed capacity (decisions.md 2026-11-08 "Rooms in user management", 2026-11-09 "Race-safe beds"). A room's
// occupants are its ACTIVE users; a disabled user keeps the room but not the bed.

/** Filter on a room's revision. Rooms created before `rev` existed have none, which counts as 0. */
export const revIs = (rev: number | undefined) => (rev ? rev : { $in: [0, null] });

export async function activeOccupants(institutionId: Types.ObjectId, roomId: Types.ObjectId, exceptUserId?: Types.ObjectId): Promise<number> {
  const filter: Record<string, unknown> = { institutionId, roomId, status: 'active' };
  if (exceptUserId) filter._id = { $ne: exceptUserId };
  return UserModel.countDocuments(filter);
}

/** The room by code in the caller's institution (400 if there's none) with a free bed, not counting `exceptUserId` (409). */
export async function roomWithFreeBed(institutionId: Types.ObjectId, code: string, exceptUserId?: Types.ObjectId): Promise<Room> {
  const room = await RoomModel.findOne({ institutionId, code }).lean();
  if (!room) throw errors.validation({ roomCode: `There is no room ${code}` });
  if ((await activeOccupants(institutionId, room._id, exceptUserId)) >= room.beds) {
    throw errors.conflict(`Room ${code} is full`, { roomCode: `Room ${code} is full (${room.beds} of ${room.beds} beds taken)` });
  }
  return room;
}

const ATTEMPTS = 5;
const pause = () => new Promise((r) => setTimeout(r, 10 + Math.random() * 40));

/**
 * Put a user in a bed of room `code` without ever overfilling it, even when requests race for the last bed. No
 * transactions: MongoDB needs a replica set for those, and the local and test databases are single servers.
 *   1. read the room with its revision, and check that a bed is free;
 *   2. `write` the user (the callback returns how to undo that write);
 *   3. bump the revision only if it is still the one read in step 1 (compare-and-set).
 * If another request bumped it in between, its user may have been missed by our count in step 1: undo, and start
 * again. The request that wins each revision counted every user written by the winners before it, so the room
 * never ends up over capacity. Writes that only free a bed (moving out, disabling, losing the student role) don't
 * need this; shrinking a room's beds uses the same revision (hostel.service `updateRoom`).
 */
export async function withFreeBed<T>(
  institutionId: Types.ObjectId,
  code: string,
  exceptUserId: Types.ObjectId | undefined,
  write: (room: Room) => Promise<{ result: T; undo: () => Promise<void> }>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const room = await roomWithFreeBed(institutionId, code, exceptUserId);
    const { result, undo } = await write(room);
    const won = await RoomModel.updateOne({ institutionId, _id: room._id, rev: revIs(room.rev) }, { $inc: { rev: 1 } });
    if (won.modifiedCount === 1) return result;
    await undo();
    if (attempt === ATTEMPTS) {
      throw errors.conflict(`Room ${code} is being changed by someone else. Try again.`, { roomCode: `Room ${code} is being changed by someone else. Try again.` });
    }
    await pause();
  }
}
