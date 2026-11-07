import type { Role } from '../roles';
import type { ModuleKey } from '../modules';

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
