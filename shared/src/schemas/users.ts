import { z } from 'zod';
import { ROLES, type Role } from '../roles';
import type { ModuleKey } from '../modules';
import { ROOM_CODE_PATTERN } from '../hostel';
import { emailSchema, objectIdSchema, paginationQuerySchema, passwordIsIdentity, passwordSchema, phoneSchema, PASSWORD_IS_IDENTITY_MESSAGE } from './common';

/** GET /users/me and the `user` part of every AuthResult. */
export interface Me {
  id: string;
  fullName: string;
  firstName: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
  room: { hostelName: string; code: string; display: string } | null;
  avatarUrl: string | null;
  institution: {
    id: string;
    name: string;
    logoUrl: string | null;
    timezone: string;
    enabledModules: ModuleKey[];
  };
  consent: { policyVersion: string; acceptedAt: string } | null;
}

/** First name for the Home greeting ("Good evening, {FIRST NAME}"): the first word of the full name. */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

// ---------------------------------------------------------------------------------------------------------
// Admin user management (docs/api.md "Users and profile"). No admin screens in Phase 1: the API and the
// CSV import script (server/src/scripts/import-users.ts) are the only callers.

/** Roles an admin can assign in Phase 1 (mess_staff arrives with the Mess module). */
export const ASSIGNABLE_ROLES = ['student', 'warden', 'institution_admin', 'super_admin'] as const satisfies readonly Role[];

export const AVATAR_MAX_BYTES = 1024 * 1024;
export const IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

/** One row of GET /users and the result of create / update. */
export interface UserSummary {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
  status: 'active' | 'disabled';
  room: { code: string; display: string } | null;
  hasAvatar: boolean;
  hasPassword: boolean;
  createdAt: string;
}

const fullNameSchema = z
  .string({ error: 'Enter the full name' })
  .trim()
  .min(2, { error: 'Enter the full name' })
  .max(120, { error: 'Use at most 120 characters' })
  .transform((v) => v.replace(/\s+/g, ' '));

const roomCodeSchema = z
  .string({ error: 'Enter a room code like CS240' })
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_PATTERN, { error: 'Enter a room code like CS240' });

const rolesSchema = z
  .array(z.enum(ASSIGNABLE_ROLES, { error: 'Unknown role' }), { error: 'Choose at least one role' })
  .min(1, { error: 'Choose at least one role' })
  .max(ASSIGNABLE_ROLES.length)
  .transform((v) => [...new Set(v)]);

/** Treat "" as "not given" (CSV cells and form fields arrive as empty strings). */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const createUserBodySchema = z
  .object({
    fullName: fullNameSchema,
    email: z.preprocess(blankToUndefined, emailSchema.optional()),
    phone: z.preprocess(blankToUndefined, phoneSchema.optional()),
    roles: rolesSchema,
    roomCode: z.preprocess(blankToUndefined, roomCodeSchema.optional()),
    password: z.preprocess(blankToUndefined, passwordSchema.optional()),
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Give an email or a mobile number' });
    if (v.roomCode && !v.roles.includes('student')) ctx.addIssue({ code: 'custom', path: ['roomCode'], message: 'Only students have a room' });
    if (v.password && passwordIsIdentity(v.password, v.email, v.phone)) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: PASSWORD_IS_IDENTITY_MESSAGE });
    }
  });
export type CreateUserBody = z.input<typeof createUserBodySchema>;

export const IMPORT_MAX_ROWS = 500;
/** Rows are validated one by one on the server, so one bad row is reported instead of failing the batch. */
export const importUsersBodySchema = z.object({
  users: z
    .array(z.record(z.string(), z.unknown()), { error: 'Send a list of users' })
    .min(1, { error: 'Send at least one user' })
    .max(IMPORT_MAX_ROWS, { error: `Send at most ${IMPORT_MAX_ROWS} users per request` }),
});
export interface ImportUsersResult {
  created: number;
  skipped: { row: number; reason: string }[];
}

/** null clears a field (email / phone: as long as one of them remains; roomCode: moves the student out). */
export const updateUserBodySchema = z
  .object({
    fullName: fullNameSchema.optional(),
    email: z.preprocess(blankToUndefined, emailSchema.nullable().optional()),
    phone: z.preprocess(blankToUndefined, phoneSchema.nullable().optional()),
    roomCode: z.preprocess(blankToUndefined, roomCodeSchema.nullable().optional()),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'Nothing to update' });
export type UpdateUserBody = z.input<typeof updateUserBodySchema>;

export const assignRolesBodySchema = z.object({ roles: rolesSchema });

export const userIdParamsSchema = z.object({ id: objectIdSchema });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  q: z.string().trim().max(60).optional().transform((v) => (v ? v : undefined)),
});
