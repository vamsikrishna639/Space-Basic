import { Schema, model, type Types } from 'mongoose';
import { MODULE_KEYS, DEFAULT_ENABLED_MODULES, type ModuleKey } from '@spacebasic/shared';

// Global collection (docs/schemas.md §1.1).
export interface Institution {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  timezone: string;
  enabledModules: ModuleKey[];
  logo: { assetId: Types.ObjectId; updatedAt: Date } | null;
  status: 'active' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<Institution>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true, match: /^[a-z0-9-]{2,60}$/ },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
    enabledModules: { type: [String], enum: MODULE_KEYS, default: () => [...DEFAULT_ENABLED_MODULES] },
    logo: { type: new Schema({ assetId: { type: Schema.Types.ObjectId, required: true }, updatedAt: { type: Date, required: true } }, { _id: false }), default: null },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ slug: 1 }, { unique: true });

export const InstitutionModel = model<Institution>('Institution', schema, 'institutions');
