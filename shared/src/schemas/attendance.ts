import { z } from 'zod';
import { paginationQuerySchema } from './common';

// QR attendance (docs/architecture.md §9, docs/api.md "Attendance"). The Entry Pass shows a QR that refreshes
// every 10 s; a warden's camera screen scans it.

export const ATTENDANCE_KINDS = ['attendance'] as const; // later phases add 'amenity' | 'checkin'
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

export const QR_REFRESH_AFTER_MS = 10_000;
/** A pass token is accepted for this long after it is issued (the scanner allows 5 s of clock skew on top). */
export const QR_TOKEN_TTL_SECONDS = 15;
/**
 * The pass token's shape: base64url(39-byte body) "." base64url(32-byte HMAC), always 96 characters. The server
 * verifies it; the warden's scanner uses the shape only to skip QR codes that aren't passes before asking the API.
 */
export const QR_TOKEN_LENGTH = 96;
export const QR_TOKEN_SHAPE = /^([A-Za-z0-9_-]{52})\.([A-Za-z0-9_-]{43})$/;

/** GET /attendance/qr-token */
export interface QrTokenResult {
  token: string;
  expiresAt: string;
  refreshAfterMs: number;
}

export const scanBodySchema = z.object({
  // A 96-character signed token (docs/api.md "Attendance"). The length cap keeps junk from the camera out of the verifier.
  token: z.string({ error: 'Scan a QR code' }).trim().min(20, { error: 'This is not a SpaceBasic QR code' }).max(2048, { error: 'This is not a SpaceBasic QR code' }),
});

/** POST /attendance/scan (201): what the warden's screen shows. */
export interface ScanResult {
  student: { fullName: string; room: string | null };
  scannedAt: string;
  kind: AttendanceKind;
}

/** GET /attendance/me */
export interface MyAttendanceItem {
  scannedAt: string;
  kind: AttendanceKind;
  scannedByName: string;
}

/** GET /attendance (wardens, admins): one day in the institution's time zone. */
export interface AttendanceItem {
  student: { id: string; fullName: string };
  room: string | null;
  scannedAt: string;
  kind: AttendanceKind;
  scannedByName: string;
}

export const myAttendanceQuerySchema = paginationQuerySchema;

export const attendanceQuerySchema = paginationQuerySchema.extend({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use the format YYYY-MM-DD' })
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), { error: 'Not a real date' })
    .optional(),
});
