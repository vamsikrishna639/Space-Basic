import type {
  CreateUserBody, HostelStructure, ImportUsersResult, Page, Role, RoomSummary, UpdateUserBody, UserSummary,
} from '@spacebasic/shared';
import { api } from '../../../api/client';

// The admin Users screens' calls (docs/api.md "Users and profile", "Hostel"). The server enforces every rule
// (roles, beds, uniqueness); the screens only check the form first so the admin sees mistakes sooner.

export const listUsers = (query: string) => api<Page<UserSummary>>('GET', `/users?${query}`);
export const getUser = (id: string) => api<UserSummary>('GET', `/users/${encodeURIComponent(id)}`);
export const createUser = (body: CreateUserBody) => api<UserSummary>('POST', '/users', { body });
export const updateUser = (id: string, body: UpdateUserBody) => api<UserSummary>('PATCH', `/users/${encodeURIComponent(id)}`, { body });
export const setRoles = (id: string, roles: Role[]) => api<UserSummary>('PATCH', `/users/${encodeURIComponent(id)}/roles`, { body: { roles } });
export const importUsers = (users: Record<string, unknown>[]) => api<ImportUsersResult>('POST', '/users/import', { body: { users } });

export const hostelStructure = () => api<HostelStructure[]>('GET', '/hostel/structure');

/** Rooms with at least one free bed, by code; `q` is the start of a room code. */
export function freeRooms(o: { floor?: string; q?: string; cursor?: string | null; limit?: number }) {
  const p = new URLSearchParams({ free: 'true', limit: String(o.limit ?? 30) });
  if (o.floor) p.set('floor', o.floor);
  if (o.q) p.set('q', o.q);
  if (o.cursor) p.set('cursor', o.cursor);
  return api<Page<RoomSummary>>('GET', `/hostel/rooms?${p}`);
}
