import type { Types } from 'mongoose';
import { CONSENT_POLICY_VERSION, type Role } from '@spacebasic/shared';
import { hashPassword } from '../core/security/password';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { FloorModel, HostelModel, RoomModel } from '../modules/hostel/hostel.models';
import { UserModel } from '../modules/users/user.model';

export const CONSENT = { accepted: true as const, policyVersion: CONSENT_POLICY_VERSION };
export const ORIGIN = 'http://localhost:5173';

let seq = 0;

export async function makeInstitution(name = 'Test University') {
  seq++;
  return InstitutionModel.create({ name, slug: `test-${seq}-${Date.now()}` });
}

export async function makeRoom(institutionId: Types.ObjectId, code = 'CS240') {
  const hostel = await HostelModel.create({ institutionId, name: 'West', code: `W${seq}` });
  const floor = await FloorModel.create({ institutionId, hostelId: hostel._id, code: code.slice(0, 2), name: 'Second floor', roomNumberMin: 201, roomNumberMax: 300, bedsPerRoom: 3 });
  return RoomModel.create({ institutionId, hostelId: hostel._id, floorId: floor._id, number: Number(code.slice(2)), code, beds: 3 });
}

export async function makeUser(
  institutionId: Types.ObjectId,
  o: { email?: string; phone?: string; password?: string; roles?: Role[]; status?: 'active' | 'disabled'; fullName?: string; roomId?: Types.ObjectId } = {},
) {
  seq++;
  return UserModel.create({
    institutionId,
    fullName: o.fullName ?? `Test User ${seq}`,
    email: o.email ?? `user${seq}@example.com`,
    phone: o.phone,
    passwordHash: o.password === undefined ? await hashPassword('Password@123') : o.password ? await hashPassword(o.password) : null,
    roles: o.roles ?? ['student'],
    status: o.status ?? 'active',
    roomId: o.roomId ?? null,
  });
}

/** Extract the refresh cookie value from a Supertest response. */
export function refreshCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const c = list.find((s) => s.startsWith('sb_rt='));
  if (!c) return undefined;
  const v = c.split(';')[0]!.slice('sb_rt='.length);
  return v || undefined;
}
