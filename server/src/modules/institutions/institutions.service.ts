import type { Types } from 'mongoose';
import { audit } from '../../core/audit/audit';
import type { ImageContentType } from '@spacebasic/shared';
import { replaceAsset } from '../assets/asset.service';
import { InstitutionModel } from './institution.model';

// Institution logo (docs/api.md "Institutions"). The logo is public by institution id (not sensitive), so Home
// can show it with a plain <img>. The `?v=` changes with every upload, so the URL can be cached.

export function logoUrlFor(institutionId: Types.ObjectId | string, logo: { updatedAt: Date }): string {
  return `/api/v1/institutions/${String(institutionId)}/logo?v=${logo.updatedAt.getTime()}`;
}

export async function setLogo(
  institutionId: Types.ObjectId,
  image: { data: Buffer; contentType: ImageContentType },
  meta: { actorId: Types.ObjectId | null; requestId?: string },
): Promise<{ logoUrl: string }> {
  const stored = await replaceAsset({ institutionId, ownerId: institutionId, kind: 'institution_logo' }, image);
  const logo = { assetId: stored.assetId, updatedAt: stored.updatedAt };
  await InstitutionModel.updateOne({ _id: institutionId }, { $set: { logo } });
  await audit({ institutionId, actorId: meta.actorId, action: 'institution.logo_update', targetType: 'institution', targetId: institutionId, meta: { bytes: image.data.length, contentType: image.contentType }, requestId: meta.requestId });
  return { logoUrl: logoUrlFor(institutionId, logo) };
}
