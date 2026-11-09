import { z } from 'zod';
import { FLOOR_CODE_PATTERN, ROOM_CODE_PATTERN } from '../hostel';
import { paginationQuerySchema } from './common';

// Hostel -> Floor -> Room (docs/schemas.md §1.7, docs/api.md "Hostel"). The layout is data: admins build it in
// Admin > Hostel (blocks, then rooms by number range); the dev seed creates block "West".

export const HOSTEL_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;
export const MAX_BEDS_PER_ROOM = 12;

export interface FloorSummary {
  code: string;
  name: string;
  order: number;
  /** The floor's room numbers: the range it was created with, then lowest and highest of its rooms. */
  roomNumberMin: number;
  roomNumberMax: number;
  /** Beds per room for the floor's newest range (the default when adding more). */
  bedsPerRoom: number;
  roomCount: number;
  /** Beds in all the floor's rooms, and how many of them active users hold. */
  beds: number;
  occupied: number;
}

/** GET /hostel/structure: hostels in order, each with its floors in order. */
export interface HostelStructure {
  hostel: { name: string; code: string; order: number };
  floors: FloorSummary[];
}

/** One row of GET /hostel/rooms. `occupants` counts active users assigned to the room. */
export interface RoomSummary {
  code: string;
  number: number;
  floorCode: string;
  hostelCode: string;
  beds: number;
  occupants: number;
}

const upperTrim = (max: number) => z.string().trim().toUpperCase().max(max);
const hostelCodeSchema = upperTrim(6).regex(HOSTEL_CODE_PATTERN, { error: 'Use 1–6 letters or digits, e.g. W' });
const floorCodeSchema = upperTrim(2).regex(FLOOR_CODE_PATTERN, { error: 'Use two letters, e.g. CS' });
const roomCodeSchema = upperTrim(5).regex(ROOM_CODE_PATTERN, { error: 'Enter a room code like CS240' });
const nameSchema = z.string().trim().min(1, { error: 'Enter a name' }).max(60, { error: 'Use at most 60 characters' });
const bedsSchema = z.number({ error: 'Enter the number of beds' }).int().min(1, { error: 'At least 1 bed' }).max(MAX_BEDS_PER_ROOM, { error: `At most ${MAX_BEDS_PER_ROOM} beds` });
const roomNumberSchema = z.number({ error: 'Enter a room number' }).int().min(1, { error: 'Room numbers start at 1' }).max(999, { error: 'Room numbers go up to 999' });

export const createHostelBodySchema = z.object({
  name: nameSchema,
  code: hostelCodeSchema,
  order: z.number().int().min(0).max(999).optional(),
});
export type CreateHostelBody = z.input<typeof createHostelBodySchema>;

export const createFloorBodySchema = z
  .object({
    hostelCode: hostelCodeSchema,
    code: floorCodeSchema,
    name: nameSchema,
    order: z.number().int().min(0).max(999).optional(),
    roomNumberMin: roomNumberSchema,
    roomNumberMax: roomNumberSchema,
    bedsPerRoom: bedsSchema.default(3),
  })
  .refine((v) => v.roomNumberMax >= v.roomNumberMin, { path: ['roomNumberMax'], error: 'Must be at least the first room number' });
export type CreateFloorBody = z.input<typeof createFloorBodySchema>;

export const generateRoomsBodySchema = z.object({ hostelCode: hostelCodeSchema });
export const floorCodeParamsSchema = z.object({ code: floorCodeSchema });
export const roomCodeParamsSchema = z.object({ code: roomCodeSchema });
export const updateRoomBodySchema = z.object({ beds: bedsSchema });

/** Rooms one request may create or delete (a floor of up to 500 rooms in one go). */
export const MAX_ROOMS_PER_RANGE = 500;

type Range = { from: number; to: number };
const toAfterFrom = (v: Range) => v.to >= v.from;
const toAfterFromIssue = { path: ['to'], error: 'Must be at least the first room number' };
const notTooMany = (v: Range) => v.to - v.from < MAX_ROOMS_PER_RANGE;
const notTooManyIssue = { path: ['to'], error: `At most ${MAX_ROOMS_PER_RANGE} rooms at a time` };

/**
 * POST /hostel/rooms/range: create rooms `floorCode` + `from`..`to` (CF101..CF180) in a block. Rooms that already
 * exist are skipped. A new floor code needs `floorName`. `dryRun: true` only reports what would happen (the preview).
 */
export const createRoomRangeBodySchema = z
  .object({
    hostelCode: hostelCodeSchema,
    floorCode: floorCodeSchema,
    floorName: nameSchema.optional(),
    from: roomNumberSchema,
    to: roomNumberSchema,
    beds: bedsSchema,
    dryRun: z.boolean().optional().default(false),
  })
  .refine(toAfterFrom, toAfterFromIssue)
  .refine(notTooMany, notTooManyIssue);
export type CreateRoomRangeBody = z.input<typeof createRoomRangeBodySchema>;

export interface CreateRoomRangeResult {
  dryRun: boolean;
  floor: { code: string; name: string; isNew: boolean };
  /** Rooms created (or, in a dry run, that would be). */
  created: string[];
  /** Rooms in the range that already exist, left as they are. */
  skipped: string[];
  /** Beds in the created rooms. */
  beds: number;
}

/** POST /hostel/rooms/range/delete: delete the floor's rooms numbered `from`..`to` that exist. */
export const deleteRoomRangeBodySchema = z
  .object({
    floorCode: floorCodeSchema,
    from: roomNumberSchema,
    to: roomNumberSchema,
    dryRun: z.boolean().optional().default(false),
  })
  .refine(toAfterFrom, toAfterFromIssue)
  .refine(notTooMany, notTooManyIssue);
export type DeleteRoomRangeBody = z.input<typeof deleteRoomRangeBodySchema>;

/** A room that can't be deleted, and who is assigned to it (disabled users keep their room, so they count). */
export interface RoomBlocker {
  code: string;
  users: { id: string; fullName: string; status: 'active' | 'disabled' }[];
}

export interface DeleteRoomRangeResult {
  dryRun: boolean;
  /** Rooms deleted (or, in a dry run, that would be when nothing blocks). */
  deleted: string[];
  /** Rooms with someone assigned: nothing is deleted while any are listed (before the delete starts). */
  blocked: RoomBlocker[];
}

export const listRoomsQuerySchema = paginationQuerySchema.extend({
  /** Up to 200 rooms a page: a whole floor in the Hostel screen. */
  limit: z.coerce.number().int().min(1).max(200).default(20),
  hostel: hostelCodeSchema.optional(),
  floor: floorCodeSchema.optional(),
  /** Start of a room code ("CS2", "cs24"): the room picker's search. */
  q: z
    .string()
    .trim()
    .toUpperCase()
    .max(5)
    .regex(/^[A-Z]{0,2}\d{0,3}$/, { error: 'Type the start of a room code, like CS2' })
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** `true`: only rooms with at least one free bed (the room picker). */
  free: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});
