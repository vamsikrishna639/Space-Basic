import { QR_TOKEN_LENGTH, QR_TOKEN_SHAPE, type ScanResult } from '@spacebasic/shared';
import { ApiError } from '../../api/client';

// The warden scanner's words (FREE DESIGN, docs/not-from-reference.md). Pure functions, so they're unit tested
// (scanText.test.ts) without a camera. The server decides what a code is; these only say it clearly.

/** True when the decoded text has the shape of a SpaceBasic pass. Anything else never reaches the API. */
export function looksLikePass(text: string): boolean {
  const t = text.trim();
  return t.length === QR_TOKEN_LENGTH && QR_TOKEN_SHAPE.test(t);
}

export type Tone = 'ok' | 'warn' | 'error';
export interface Outcome { tone: Tone; title: string; lines: string[] }

export const NOT_A_PASS: Outcome = {
  tone: 'error',
  title: 'Not an entry pass',
  lines: ["This QR code isn't a SpaceBasic entry pass. Ask the student to open My Profile › Show my QR code."],
};

export function okOutcome(r: ScanResult): Outcome {
  return { tone: 'ok', title: 'Attendance marked', lines: [r.student.fullName, r.student.room ?? 'No room assigned'] };
}

/**
 * What the API's refusals mean at the gate (server: attendance.service.ts `scan`):
 *   409 ALREADY_SCANNED  the same student within 5 minutes ("… was marked a moment ago."), or the same code again
 *   400 VALIDATION_ERROR an expired code (older than 15 s + 5 s skew), or a forged / damaged one
 *   404 NOT_FOUND        another institution's pass, or a student who is no longer active
 *   429 RATE_LIMITED     more than 120 scans a minute from this warden
 * The server's message is shown as it is: it already names the student or says what to do.
 */
export function errorOutcome(e: unknown): Outcome {
  if (!(e instanceof ApiError)) return { tone: 'error', title: "Couldn't mark attendance", lines: ['Something went wrong. Try again.'] };
  const message = e.fields?.token ?? e.message;
  switch (e.code) {
    case 'ALREADY_SCANNED':
      return { tone: 'warn', title: 'Already marked', lines: [message] };
    case 'VALIDATION_ERROR':
      return { tone: 'error', title: 'Code not accepted', lines: [message] };
    case 'NOT_FOUND':
      return { tone: 'error', title: 'Student not found', lines: [message, 'This pass may belong to another institution.'] };
    case 'RATE_LIMITED':
      return { tone: 'error', title: 'Too many scans', lines: ['Wait a moment, then scan again.'] };
    case 'NETWORK':
      return { tone: 'error', title: 'No connection', lines: [message] };
    default:
      return { tone: 'error', title: "Couldn't mark attendance", lines: [message] };
  }
}

export type CameraProblem = 'denied' | 'none' | 'busy' | 'insecure' | 'failed';

/** Why the camera didn't start: a DOMException from getUserMedia, or qr-scanner's "Camera not found." string. */
export function cameraProblem(e: unknown, secureContext = true): CameraProblem {
  if (!secureContext) return 'insecure';
  const name = e instanceof Error || (typeof e === 'object' && e !== null && 'name' in e) ? String((e as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  if (typeof e === 'string' && /camera not found/i.test(e)) return 'none';
  return 'failed';
}

/**
 * qr-scanner 1.4.2 swallows getUserMedia's error and always rejects with "Camera not found.", so a refused
 * permission would read as "no camera". When that happens, ask the browser once more directly to learn the real
 * reason (the stream, if any, is stopped at once). Only on the failure path; a working camera is opened once.
 */
export async function diagnoseCamera(
  e: unknown,
  env: { secure: boolean; getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> },
): Promise<CameraProblem> {
  if (!env.secure) return 'insecure';
  if (typeof e !== 'string') return cameraProblem(e);
  if (!env.getUserMedia) return 'none';
  try {
    const stream = await env.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((t) => t.stop());
    return 'failed'; // a camera works now, but the scanner's own start didn't
  } catch (real) {
    return cameraProblem(real); // anything unrecognised stays "didn't start", never a made-up "no camera"
  }
}

export const CAMERA_TEXT: Record<CameraProblem, { title: string; text: string }> = {
  denied: {
    title: 'Camera access is blocked',
    // In the installed app (a Trusted Web Activity) the camera is Chrome's, not the app's: the app itself requests
    // no permissions (checked on Android 16), so both settings below are Chrome's.
    text: 'Allow it in Chrome: Settings › Site settings › Camera (the installed app uses Chrome’s setting too). If Chrome itself may not use the camera: Android Settings › Apps › Chrome › Permissions › Camera. Then tap Try again.',
  },
  none: { title: 'No camera found', text: 'This device has no camera the browser can use. Scan on a phone instead.' },
  busy: { title: 'The camera is in use', text: 'Another app is using the camera. Close it, then tap Try again.' },
  insecure: { title: 'Camera needs a secure page', text: 'Open Space Basic over https:// (or the installed app) to use the camera.' },
  failed: { title: "The camera didn't start", text: 'Tap Try again. If it keeps failing, restart the app.' },
};
