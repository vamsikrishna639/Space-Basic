import type { Types } from 'mongoose';
import { firstNameOf, roomDisplay, type Me } from '@spacebasic/shared';
import { errors } from '../../core/http/errors';
import { UserModel } from './user.model';
import { InstitutionModel } from '../institutions/institution.model';
import { HostelModel, RoomModel } from '../hostel/hostel.models';
import { currentConsent } from '../consent/consent.service';

/** The `?v=` changes with every upload, so the client knows when to fetch the photo again. */
export function avatarUrlFor(avatar: { updatedAt: Date }): string {
  return `/api/v1/users/me/avatar?v=${avatar.updatedAt.getTime()}`;
}

/** GET /users/me and the `user` of every AuthResult (shared/src/schemas/users.ts). */
export async function buildMe(institutionId: Types.ObjectId, userId: Types.ObjectId): Promise<Me> {
  const user = await UserModel.findOne({ _id: userId, institutionId }).lean();
  if (!user) throw errors.unauthenticated();
  const [institution, room, consent] = await Promise.all([
    InstitutionModel.findById(institutionId).lean(),
    user.roomId ? RoomModel.findOne({ _id: user.roomId, institutionId }).lean() : null,
    currentConsent({ institutionId, userId }),
  ]);
  if (!institution) throw errors.unauthenticated();
  const hostel = room ? await HostelModel.findOne({ _id: room.hostelId, institutionId }).lean() : null;

  return {
    id: String(user._id),
    fullName: user.fullName,
    firstName: firstNameOf(user.fullName),
    email: user.email ?? null,
    phone: user.phone ?? null,
    roles: user.roles,
    room: room && hostel ? { hostelName: hostel.name, code: room.code, display: roomDisplay(hostel.name, room.code) } : null,
    avatarUrl: user.avatar ? avatarUrlFor(user.avatar) : null,
    institution: {
      id: String(institution._id),
      name: institution.name,
      logoUrl: institution.logo ? `/api/v1/institutions/${institution._id}/logo?v=${institution.logo.updatedAt.getTime()}` : null,
      timezone: institution.timezone,
      enabledModules: institution.enabledModules,
    },
    consent: consent ? { policyVersion: consent.policyVersion, acceptedAt: consent.acceptedAt.toISOString() } : null,
  };
}
