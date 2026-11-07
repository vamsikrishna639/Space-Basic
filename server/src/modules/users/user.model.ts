import { Schema, model, type Types } from 'mongoose';
import { ROLES, type Role } from '@spacebasic/shared';
import { tenantScope } from '../../core/db/tenant';

// Tenant-scoped (docs/schemas.md §1.2). Email and phone are globally unique (sign-in has no institution picker).
export interface User {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  passwordHash?: string | null;
  roles: Role[];
  status: 'active' | 'disabled';
  roomId?: Types.ObjectId | null;
  avatar: { assetId: Types.ObjectId; updatedAt: Date } | null;
  passwordChangedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<User>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254, default: undefined },
    phone: { type: String, match: /^\+[1-9]\d{7,14}$/, default: undefined },
    passwordHash: { type: String, select: false, default: null },
    roles: { type: [String], enum: ROLES, required: true, validate: (v: string[]) => v.length > 0 },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    avatar: { type: new Schema({ assetId: { type: Schema.Types.ObjectId, required: true }, updatedAt: { type: Date, required: true } }, { _id: false }), default: null },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { transform: (_doc, ret: Record<string, unknown>) => { delete ret.passwordHash; return ret; } },
  },
);
schema.pre('validate', function () {
  if (!this.email && !this.phone) this.invalidate('email', 'Either email or phone is required');
});
schema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
schema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
schema.index({ institutionId: 1, roles: 1, fullName: 1 });
schema.index({ institutionId: 1, roomId: 1 });
schema.plugin(tenantScope);

export const UserModel = model<User>('User', schema, 'users');
