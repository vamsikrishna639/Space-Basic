import { z } from 'zod';
import { FLOOR_CODE_PATTERN, ROOM_CODE_PATTERN } from '../hostel';
import { paginationQuerySchema } from './common';

// Hostel -> Floor -> Room (docs/schemas.md §1.7, docs/api.md "Hostel"). The layout is data: admins create
// hostels and floors through the API (the hostel admin screen comes after deployment); the dev seed creates block "West".

export const HOSTEL_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;
export const MAX_BEDS_PER_ROOM = 12;

export interface FloorSummary {
  code: string;
  name: string;
  order: number;
  roomNumberMin: number;
  roomNumberMax: number;
  bedsPerRoom: number;
  roomCount: number;
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

export const listRoomsQuerySchema = paginationQuerySchema.extend({
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
