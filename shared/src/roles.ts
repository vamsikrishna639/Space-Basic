// Roles and permissions (docs/architecture.md §5).
// Routes declare PERMISSIONS, never role names. The client uses this map only to hide UI, never for security.

export const ROLES = ['student', 'warden', 'mess_staff', 'institution_admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

/** Roles implemented in Phase 1 (mess_staff arrives with the Mess module). */
export const PHASE1_ROLES: readonly Role[] = ['student', 'warden', 'institution_admin', 'super_admin'];

export const PERMISSIONS = [
  'profile:read', 'profile:update',
  'consent:read', 'consent:withdraw',
  'notifications:read', 'notifications:mark_read',
  'attendance:qr:issue', 'attendance:scan', 'attendance:read', 'attendance:read:own',
  'support:read', 'support:manage',
  'users:read', 'users:create', 'users:import', 'users:update', 'users:assign_role',
  'hostel:read', 'hostel:read:own', 'hostel:manage',
  'institution:read', 'institution:manage', 'institution:create',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SELF: Permission[] = [
  'profile:read', 'profile:update', 'consent:read', 'consent:withdraw',
  'notifications:read', 'notifications:mark_read', 'support:read', 'institution:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  student: [...SELF, 'attendance:qr:issue', 'attendance:read:own', 'hostel:read:own'],
  warden: [...SELF, 'attendance:scan', 'attendance:read', 'users:read', 'hostel:read'],
  mess_staff: [...SELF],
  institution_admin: [
    ...SELF, 'attendance:scan', 'attendance:read', 'support:manage',
    'users:read', 'users:create', 'users:import', 'users:update', 'users:assign_role',
    'hostel:read', 'hostel:manage', 'institution:manage', 'audit:read',
  ],
  super_admin: [...PERMISSIONS],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
  return out;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => (ROLE_PERMISSIONS[r] ?? []).includes(permission));
}
