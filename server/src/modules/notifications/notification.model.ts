import { Schema, model, type Types } from 'mongoose';
import { MODULE_KEYS, NOTIFICATION_TYPES, type ModuleKey, type NotificationType } from '@spacebasic/shared';
import { tenantScope } from '../../core/db/tenant';

// docs/schemas.md §1.8. Tenant-scoped; every read is also filtered by the owner's userId.
export interface Notification {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string | null;
  link: { module: ModuleKey; refId: Types.ObjectId | null } | null;
  readAt: Date | null;
  createdAt: Date;
}

const schema = new Schema<Notification>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 500, default: null },
    link: {
      type: new Schema({ module: { type: String, enum: MODULE_KEYS, required: true }, refId: { type: Schema.Types.ObjectId, default: null } }, { _id: false }),
      default: null,
    },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
schema.index({ institutionId: 1, userId: 1, createdAt: -1, _id: -1 });
schema.index({ institutionId: 1, userId: 1, readAt: 1 });
schema.plugin(tenantScope);

export const NotificationModel = model<Notification>('Notification', schema, 'notifications');
