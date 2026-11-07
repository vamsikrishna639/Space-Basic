import { Schema, model, type Types } from 'mongoose';
import { AVATAR_MAX_BYTES, IMAGE_CONTENT_TYPES, type ImageContentType } from '@spacebasic/shared';
import { tenantScope } from '../../core/db/tenant';

// Small binary images kept in MongoDB (docs/schemas.md §1.11; decisions.md: no paid storage).
// Tenant-scoped. `data` is never selected unless asked for, so lists and logs never carry image bytes.
export type AssetKind = 'avatar' | 'institution_logo';

export interface Asset {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  kind: AssetKind;
  ownerId: Types.ObjectId;
  contentType: ImageContentType;
  size: number;
  data: Buffer;
  sha256: string;
  createdAt: Date;
}

const schema = new Schema<Asset>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['avatar', 'institution_logo'], required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    contentType: { type: String, enum: IMAGE_CONTENT_TYPES, required: true },
    size: { type: Number, required: true, min: 1, max: AVATAR_MAX_BYTES },
    data: { type: Buffer, required: true, select: false },
    sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
schema.index({ institutionId: 1, kind: 1, ownerId: 1 });
schema.plugin(tenantScope);

export const AssetModel = model<Asset>('Asset', schema, 'assets');
