import { Types } from 'mongoose';
import {
  NOTIFICATION_LINK_MODULE, NOTIFICATION_TITLES,
  type NotificationItem, type NotificationType, type Page, type UnreadCount,
} from '@spacebasic/shared';
import { errors } from '../../core/http/errors';
import { NotificationModel, type Notification } from './notification.model';

// Notifications (docs/api.md "Notifications"). A user only ever sees and changes their own.

interface Who { institutionId: Types.ObjectId; userId: Types.ObjectId }

function toItem(n: Notification): NotificationItem {
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link: n.link ? { module: n.link.module, refId: n.link.refId ? String(n.link.refId) : null } : null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

function decodeCursor(cursor: string): { t: Date; i: Types.ObjectId } {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    const t = typeof v.t === 'string' ? new Date(v.t) : null;
    if (t && !Number.isNaN(t.getTime()) && typeof v.i === 'string' && Types.ObjectId.isValid(v.i)) return { t, i: new Types.ObjectId(v.i) };
  } catch { /* fall through */ }
  throw errors.validation({ cursor: 'Invalid cursor' });
}
const encodeCursor = (n: Notification) => Buffer.from(JSON.stringify({ t: n.createdAt.toISOString(), i: String(n._id) })).toString('base64url');

/** Newest first (the screen groups them by day). */
export async function list(who: Who, q: { limit: number; cursor?: string }): Promise<Page<NotificationItem>> {
  const filter: Record<string, unknown> = { institutionId: who.institutionId, userId: who.userId };
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    filter.$or = [{ createdAt: { $lt: c.t } }, { createdAt: c.t, _id: { $lt: c.i } }];
  }
  const rows = await NotificationModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(q.limit + 1).lean();
  const page = rows.slice(0, q.limit);
  return { items: page.map(toItem), nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null };
}

export async function unreadCount(who: Who): Promise<UnreadCount> {
  return { count: await NotificationModel.countDocuments({ institutionId: who.institutionId, userId: who.userId, readAt: null }) };
}

/** Idempotent: reading an already-read notification keeps its first readAt. Someone else's is 404. */
export async function markRead(who: Who, id: string): Promise<void> {
  const filter = { institutionId: who.institutionId, userId: who.userId, _id: id };
  const updated = await NotificationModel.updateOne({ ...filter, readAt: null }, { $set: { readAt: new Date() } });
  if (updated.matchedCount === 0 && !(await NotificationModel.exists(filter))) throw errors.notFound();
}

/**
 * For other modules (QR/Attendance now; Leave, Announcements later). The title defaults to the one shown in
 * the screenshots, and the deep link to the type's module.
 */
export async function createNotification(input: {
  institutionId: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title?: string;
  body?: string | null;
  refId?: Types.ObjectId | null;
  createdAt?: Date;
}): Promise<NotificationItem> {
  const doc = await NotificationModel.create({
    institutionId: input.institutionId,
    userId: input.userId,
    type: input.type,
    title: input.title ?? NOTIFICATION_TITLES[input.type],
    body: input.body ?? null,
    link: { module: NOTIFICATION_LINK_MODULE[input.type], refId: input.refId ?? null },
    readAt: null,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  return toItem(doc.toObject());
}
