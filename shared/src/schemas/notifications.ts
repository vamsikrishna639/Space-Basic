import { z } from 'zod';
import type { ModuleKey } from '../modules';
import { objectIdSchema, paginationQuerySchema } from './common';

// Notifications (docs/schemas.md §1.8, docs/api.md "Notifications"). Types grow additively in later phases.
// In Phase 1 only attendance_marked is created by the system (QR scan); the others are seeded dev samples.

export const NOTIFICATION_TYPES = [
  'attendance_marked',
  'announcement_new',
  'leave_submitted',
  'leave_partially_approved',
  'leave_approved',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Titles exactly as the Notifications screenshot shows them. */
export const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  attendance_marked: 'Attendance Marked',
  announcement_new: '👋 New Announcement',
  leave_submitted: 'Leave Request Submitted',
  leave_partially_approved: 'Leave Partially Approved',
  leave_approved: 'Great News: Leave Approved',
};

/** Where tapping a row goes. Modules that aren't live yet open the ComingSoon screen. */
export const NOTIFICATION_LINK_MODULE: Record<NotificationType, ModuleKey> = {
  attendance_marked: 'attendance',
  announcement_new: 'announcements',
  leave_submitted: 'leave',
  leave_partially_approved: 'leave',
  leave_approved: 'leave',
};

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: { module: ModuleKey; refId: string | null } | null;
  readAt: string | null;
  createdAt: string;
}

export const listNotificationsQuerySchema = paginationQuerySchema;
export const notificationIdParamsSchema = z.object({ id: objectIdSchema });

export interface UnreadCount {
  count: number;
}
