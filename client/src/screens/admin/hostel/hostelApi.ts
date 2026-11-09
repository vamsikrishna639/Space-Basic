import type {
  CreateHostelBody, CreateRoomRangeBody, CreateRoomRangeResult, DeleteRoomRangeBody, DeleteRoomRangeResult, HostelStructure,
  Page, RoomSummary,
} from '@spacebasic/shared';
import { api } from '../../../api/client';

// Admin > Hostel calls (docs/api.md "Hostel"). The server enforces every rule (admins only, occupied rooms can't
// go, beds never below the beds taken); the screen checks the form first with the same shared schemas.

export const hostelStructure = () => api<HostelStructure[]>('GET', '/hostel/structure');

/** A floor's rooms (or, with `q`, rooms whose code starts with it, on any floor), by code. */
export function roomsPage(o: { floor?: string; q?: string; cursor?: string | null }) {
  const p = new URLSearchParams({ limit: '200' });
  if (o.floor && !o.q) p.set('floor', o.floor);
  if (o.q) p.set('q', o.q);
  if (o.cursor) p.set('cursor', o.cursor);
  return api<Page<RoomSummary>>('GET', `/hostel/rooms?${p}`);
}

export const createBlock = (body: CreateHostelBody) => api<{ name: string; code: string; order: number }>('POST', '/hostel/hostels', { body });
export const createRoomRange = (body: CreateRoomRangeBody) => api<CreateRoomRangeResult>('POST', '/hostel/rooms/range', { body });
export const deleteRoomRange = (body: DeleteRoomRangeBody) => api<DeleteRoomRangeResult>('POST', '/hostel/rooms/range/delete', { body });
export const deleteRoom = (code: string) => api<DeleteRoomRangeResult>('DELETE', `/hostel/rooms/${encodeURIComponent(code)}`);
export const deleteFloor = (code: string) => api<void>('DELETE', `/hostel/floors/${encodeURIComponent(code)}`);
export const setRoomBeds = (code: string, beds: number) => api<RoomSummary>('PATCH', `/hostel/rooms/${encodeURIComponent(code)}`, { body: { beds } });
