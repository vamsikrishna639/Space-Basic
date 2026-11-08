import { Schema, model, type Types } from 'mongoose';
import { ATTENDANCE_KINDS, type AttendanceKind } from '@spacebasic/shared';
import { tenantScope } from '../../core/db/tenant';

// docs/schemas.md §1.9. The unique jti (the QR token id) is the replay protection: a token is accepted once.
export interface AttendanceLog {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  scannedBy: Types.ObjectId;
  scannedAt: Date;
  kind: AttendanceKind;
  jti: string;
}

const schema = new Schema<AttendanceLog>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    scannedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    scannedAt: { type: Date, required: true },
    kind: { type: String, enum: ATTENDANCE_KINDS, required: true, default: 'attendance' },
    jti: { type: String, required: true, maxlength: 64 },
  },
  { versionKey: false },
);
schema.index({ jti: 1 }, { unique: true });
schema.index({ institutionId: 1, studentId: 1, scannedAt: -1 });
schema.index({ institutionId: 1, scannedAt: -1 });
schema.plugin(tenantScope);

export const AttendanceLogModel = model<AttendanceLog>('AttendanceLog', schema, 'attendance_logs');
