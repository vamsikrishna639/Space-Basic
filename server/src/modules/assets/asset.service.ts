import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { AVATAR_MAX_BYTES, IMAGE_CONTENT_TYPES, type ImageContentType } from '@spacebasic/shared';
import { AppError, errors } from '../../core/http/errors';
import { AssetModel, type AssetKind } from './asset.model';

/** Identify the image format from its first bytes; the declared Content-Type alone is not trusted. */
export function sniffImageType(data: Buffer): ImageContentType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const unsupported = () =>
  new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Choose a PNG, JPEG or WebP image.');

/**
 * Check an uploaded raw body: declared type is an allowed image type, the bytes really are that type,
 * and the size is within the limit (the raw parser enforces the limit too; this is the second check).
 */
export function checkImageUpload(req: Request): { data: Buffer; contentType: ImageContentType } {
  const declared = (req.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(declared)) throw unsupported();
  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0) throw unsupported();
  if (data.length > AVATAR_MAX_BYTES) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Choose an image under 1 MB.');
  const actual = sniffImageType(data);
  if (actual !== declared) throw unsupported();
  return { data, contentType: actual };
}

/** Store a new image for an owner and delete the owner's previous one of the same kind. */
export async function replaceAsset(
  scope: { institutionId: Types.ObjectId; ownerId: Types.ObjectId; kind: AssetKind },
  image: { data: Buffer; contentType: ImageContentType },
): Promise<{ assetId: Types.ObjectId; updatedAt: Date }> {
  const created = await AssetModel.create({
    ...scope,
    contentType: image.contentType,
    size: image.data.length,
    data: image.data,
    sha256: crypto.createHash('sha256').update(image.data).digest('hex'),
  });
  await AssetModel.deleteMany({ ...scope, _id: { $ne: created._id } });
  return { assetId: created._id, updatedAt: created.createdAt };
}

export async function deleteAssets(scope: { institutionId: Types.ObjectId; ownerId: Types.ObjectId; kind: AssetKind }): Promise<void> {
  await AssetModel.deleteMany(scope);
}

/**
 * Send an asset with a strong ETag (sha256), answering 304 to a matching If-None-Match.
 * `cacheControl` differs per kind: avatars are private to the signed-in user, logos are public.
 */
export async function sendAsset(
  req: Request,
  res: Response,
  where: { institutionId: Types.ObjectId; _id: Types.ObjectId; kind: AssetKind },
  cacheControl: string,
): Promise<void> {
  const meta = await AssetModel.findOne(where, { contentType: 1, sha256: 1, size: 1 }).lean();
  if (!meta) throw errors.notFound();
  const etag = `"${meta.sha256}"`;
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const inm = req.get('if-none-match');
  if (inm && inm.split(',').map((s) => s.trim().replace(/^W\//, '')).includes(etag)) {
    res.status(304).end();
    return;
  }
  // Hydrated (not lean) so `data` is a Node Buffer rather than a BSON Binary.
  const full = await AssetModel.findOne(where).select('+data');
  if (!full) throw errors.notFound();
  res.setHeader('Content-Type', full.contentType);
  res.setHeader('Content-Length', String(full.data.length));
  res.end(full.data);
}
