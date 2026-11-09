import {
  createRoomRangeBodySchema, deleteRoomRangeBodySchema, ROOM_CODE_PATTERN,
  type CreateRoomRangeBody, type DeleteRoomRangeBody, type FloorSummary, type HostelStructure, type RoomSummary,
} from '@spacebasic/shared';
import { plural, roomSearchText } from '../users/usersText';

// Words and form checks for Admin > Hostel (FREE DESIGN; docs/not-from-reference.md). Pure, unit-tested.

export { plural, roomSearchText };

/**
 * Room codes as short ranges: ["CF101", "CF102", "CF103", "CF105"] -> "CF101–CF103, CF105". After `max` groups the
 * rest is counted ("and 4 more").
 */
export function codeRanges(codes: readonly string[], max = 4): string {
  const groups: [string, string][] = [];
  const num = (c: string) => Number(c.slice(2));
  for (const code of codes) {
    const last = groups[groups.length - 1];
    if (last && last[1].slice(0, 2) === code.slice(0, 2) && num(code) === num(last[1]) + 1) last[1] = code;
    else groups.push([code, code]);
  }
  const text = groups.slice(0, max).map(([a, b]) => (a === b ? a : `${a}–${b}`));
  const rest = groups.slice(max).reduce((n, [a, b]) => n + num(b) - num(a) + 1, 0);
  return rest ? `${text.join(', ')} and ${rest} more` : text.join(', ');
}

/** "CF101–CF180", or "No rooms yet". */
export function floorRangeText(f: Pick<FloorSummary, 'code' | 'roomCount' | 'roomNumberMin' | 'roomNumberMax'>): string {
  if (!f.roomCount) return 'No rooms yet';
  const code = (n: number) => `${f.code}${String(n).padStart(3, '0')}`;
  return f.roomNumberMin === f.roomNumberMax ? code(f.roomNumberMin) : `${code(f.roomNumberMin)}–${code(f.roomNumberMax)}`;
}

/** "80 rooms · 240 beds · 3 taken". */
export function floorStatsText(f: Pick<FloorSummary, 'roomCount' | 'beds' | 'occupied'>): string {
  return `${plural(f.roomCount, 'room')} · ${plural(f.beds, 'bed')} · ${f.occupied} taken`;
}

export interface Totals { rooms: number; beds: number; occupied: number }
export function totals(structure: readonly HostelStructure[]): Totals {
  const floors = structure.flatMap((h) => h.floors);
  return {
    rooms: floors.reduce((n, f) => n + f.roomCount, 0),
    beds: floors.reduce((n, f) => n + f.beds, 0),
    occupied: floors.reduce((n, f) => n + f.occupied, 0),
  };
}

/** A room tile's line: "3 beds, all free", "1 of 3 taken", "Full (3 of 3)". */
export function takenText(r: Pick<RoomSummary, 'beds' | 'occupants'>): string {
  if (!r.occupants) return `${plural(r.beds, 'bed')}, all free`;
  if (r.occupants >= r.beds) return `Full (${r.beds} of ${r.beds})`;
  return `${r.occupants} of ${r.beds} taken`;
}

export const isRoomCode = (v: string) => ROOM_CODE_PATTERN.test(v);

// ---- forms ----------------------------------------------------------------------------------------------

export interface AddRoomsForm {
  hostelCode: string;
  /** An existing floor code, or '' for a new floor (then `newCode` and `newName`). */
  floorCode: string;
  newCode: string;
  newName: string;
  from: string;
  to: string;
  beds: string;
}

const toNumber = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** The request body for the form (dry run or not), or the field errors from the shared schema. */
export function addRoomsBody(form: AddRoomsForm, dryRun: boolean): { body: CreateRoomRangeBody } | { errors: Record<string, string> } {
  const isNew = form.floorCode === '';
  const raw = {
    hostelCode: form.hostelCode,
    floorCode: isNew ? form.newCode : form.floorCode,
    floorName: isNew ? form.newName.trim() || undefined : undefined,
    from: toNumber(form.from), to: toNumber(form.to), beds: toNumber(form.beds), dryRun,
  };
  const parsed = createRoomRangeBodySchema.safeParse(raw);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      const field = key === 'floorCode' && isNew ? 'newCode' : key === 'floorName' ? 'newName' : key;
      errors[field] ??= issue.message;
    }
  }
  if (isNew && !form.newName.trim()) errors.newName ??= 'Name the new floor, for example First floor';
  return Object.keys(errors).length ? { errors } : { body: raw as CreateRoomRangeBody };
}

export interface RemoveRoomsForm { from: string; to: string }

export function removeRoomsBody(floorCode: string, form: RemoveRoomsForm, dryRun: boolean): { body: DeleteRoomRangeBody } | { errors: Record<string, string> } {
  const raw = { floorCode, from: toNumber(form.from), to: toNumber(form.to), dryRun };
  const parsed = deleteRoomRangeBodySchema.safeParse(raw);
  if (parsed.success) return { body: raw as DeleteRoomRangeBody };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return { errors };
}

/** The lowest bed count allowed for a room: the beds taken now, and at least 1. */
export const minBeds = (r: Pick<RoomSummary, 'occupants'>) => Math.max(1, r.occupants);
