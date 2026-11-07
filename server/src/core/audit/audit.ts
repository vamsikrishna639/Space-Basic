import { Schema, model, type Types } from 'mongoose';

// Audit log for sensitive actions (docs/schemas.md §1.12). institutionId may be null for platform actions.
export interface AuditEntry {
  institutionId: Types.ObjectId | null;
  actorId: Types.ObjectId | null;
  action: string;
  targetType?: string;
  targetId?: Types.ObjectId;
  meta?: Record<string, unknown>;
  requestId?: string;
  at: Date;
}
const schema = new Schema<AuditEntry>(
  {
    institutionId: { type: Schema.Types.ObjectId, default: null },
    actorId: { type: Schema.Types.ObjectId, default: null },
    action: { type: String, required: true },
    targetType: String,
    targetId: Schema.Types.ObjectId,
    meta: { type: Schema.Types.Mixed },
    requestId: String,
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);
schema.index({ institutionId: 1, at: -1 });
schema.index({ action: 1, at: -1 });
export const AuditModel = model<AuditEntry>('AuditLog', schema, 'audit_logs');

export async function audit(entry: Omit<AuditEntry, 'at'>): Promise<void> {
  await AuditModel.create({ ...entry, at: new Date() });
}
