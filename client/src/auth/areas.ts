import type { Me, Role } from '@spacebasic/shared';

// Which app a signed-in user gets (docs/decisions.md 2026-11-09, "Role-based routing"). Each role has its own area;
// staff never get the student app and students never get a staff one. This only decides what the client SHOWS:
// the server's permission checks are what keep the roles apart (server/src/test/role-separation.test.ts).

export type Area = 'student' | 'warden' | 'admin';

export const AREAS: Record<Area, { home: string; label: string; blurb: string }> = {
  student: { home: '/home', label: 'Student', blurb: 'Your entry pass, notifications and help' },
  warden: { home: '/warden', label: 'Warden', blurb: "Scan entry passes, today's attendance, find a student or room" },
  admin: { home: '/admin', label: 'Admin', blurb: 'Users, the hostel, support content and the audit log' },
};

const ROLE_AREA: Partial<Record<Role, Area>> = {
  student: 'student',
  warden: 'warden',
  institution_admin: 'admin',
  super_admin: 'admin', // SpaceBasic staff manage an institution like its admin
  // mess_staff: no app until the Mess module exists
};
const ORDER: Area[] = ['student', 'warden', 'admin'];

/** The areas this user may open, in a fixed order. */
export function areasFor(roles: readonly Role[]): Area[] {
  const set = new Set(roles.flatMap((r) => (ROLE_AREA[r] ? [ROLE_AREA[r]] : [])));
  return ORDER.filter((a) => set.has(a));
}

/**
 * Where a signed-in user goes: their only area; with several, the one last chosen on this device, otherwise the
 * "Continue as" chooser; with none, a plain "no app for your account" page.
 */
export function landingPath(roles: readonly Role[], remembered: Area | null): string {
  const areas = areasFor(roles);
  if (areas.length === 0) return '/no-access';
  if (areas.length === 1) return AREAS[areas[0]!].home;
  if (remembered && areas.includes(remembered)) return AREAS[remembered].home;
  return '/choose';
}

// The last area chosen, per user, on this device: a convenience only (storage may be unavailable).
const key = (userId: string) => `sb.area.${userId}`;

export function rememberedArea(userId: string): Area | null {
  try {
    const v = localStorage.getItem(key(userId));
    return v === 'student' || v === 'warden' || v === 'admin' ? v : null;
  } catch {
    return null;
  }
}

export function rememberArea(userId: string, area: Area): void {
  try { localStorage.setItem(key(userId), area); } catch { /* private mode: ask again next time */ }
}

export const landingFor = (me: Me) => landingPath(me.roles, rememberedArea(me.id));
