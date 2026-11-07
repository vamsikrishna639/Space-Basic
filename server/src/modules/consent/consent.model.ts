import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../../core/db/tenant';

// DPDPA 2023 consent records (docs/schemas.md §1.6).
export interface Consent {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  userId: Types.ObjectId;
  policyVersion: string;
  acceptedAt: Date;
  source: 'signin' | 'reconsent';
  withdrawnAt: Date | null;
  ip?: string;
  userAgent?: string;
}
const schema = new Schema<Consent>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    policyVersion: { type: String, required: true },
    acceptedAt: { type: Date, required: true },
    source: { type: String, enum: ['signin', 'reconsent'], required: true },
    withdrawnAt: { type: Date, default: null },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ institutionId: 1, userId: 1, acceptedAt: -1 });
schema.plugin(tenantScope);
export const ConsentModel = model<Consent>('Consent', schema, 'consents');
