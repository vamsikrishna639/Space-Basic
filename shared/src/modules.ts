// Module registry (docs/architecture.md §7). One place that drives Home (Apps grid, Quick Actions),
// Profile rows, client routes and server routers. Phase 2+ modules flip `status` to 'live'.

export const MODULE_KEYS = ['notifications', 'support', 'attendance', 'leave', 'tickets', 'announcements', 'mess'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDefinition {
  key: ModuleKey;
  title: string;
  status: 'live' | 'coming_soon';
  phase: number;
}

export const MODULES: Record<ModuleKey, ModuleDefinition> = {
  notifications: { key: 'notifications', title: 'Notifications', status: 'live', phase: 1 },
  support: { key: 'support', title: 'Help', status: 'live', phase: 1 },
  attendance: { key: 'attendance', title: 'Attendance', status: 'live', phase: 1 },
  leave: { key: 'leave', title: 'Leave Manager', status: 'coming_soon', phase: 2 },
  tickets: { key: 'tickets', title: 'Tickets', status: 'coming_soon', phase: 3 },
  announcements: { key: 'announcements', title: 'Announcements', status: 'coming_soon', phase: 4 },
  mess: { key: 'mess', title: 'Mess Manager', status: 'coming_soon', phase: 5 },
};

/** Modules enabled for a new institution by default (coming_soon ones are listed so their entry points show). */
export const DEFAULT_ENABLED_MODULES: ModuleKey[] = [...MODULE_KEYS];
