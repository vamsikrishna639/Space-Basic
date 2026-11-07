import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../../core/db/tenant';

// Refresh-token sessions (tenant-scoped; looked up by token hash via a documented unscoped query).
export type RevokeReason = 'logout' | 'reuse_detected' | 'password_changed' | 'password_reset' | 'consent_withdrawn' | 'disabled' | 'admin';
export interface Session {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  userId: Types.ObjectId;
  currentHash: string;
  previousHashes: string[];
  rotatedAt: Date | null;
  lastUsedAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: RevokeReason | null;
  userAgent?: string;
  createdAt: Date;
}
const sessionSchema = new Schema<Session>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    currentHash: { type: String, required: true, select: false },
    previousHashes: { type: [String], default: [], select: false },
    rotatedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true, versionKey: false },
);
sessionSchema.index({ currentHash: 1 }, { unique: true });
sessionSchema.index({ previousHashes: 1 });
sessionSchema.index({ institutionId: 1, userId: 1, revokedAt: 1 });
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.plugin(tenantScope);
export const SessionModel = model<Session>('Session', sessionSchema, 'sessions');

// One-time codes (global collection; docs/schemas.md §1.4). Only HMAC hashes are stored.
export type OtpPurpose = 'login' | 'reset_password';
export interface OtpCode {
  _id: Types.ObjectId;
  purpose: OtpPurpose;
  channel: 'email' | 'sms' | 'whatsapp';
  identifier: string;
  userId: Types.ObjectId | null;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}
const otpSchema = new Schema<OtpCode>(
  {
    purpose: { type: String, enum: ['login', 'reset_password'], required: true },
    channel: { type: String, enum: ['email', 'sms', 'whatsapp'], required: true },
    identifier: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, default: null },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
otpSchema.index({ identifier: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OtpCodeModel = model<OtpCode>('OtpCode', otpSchema, 'otp_codes');
