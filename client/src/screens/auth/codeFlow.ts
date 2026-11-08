// Shared logic of the one-time-code screens: email / SMS / WhatsApp sign-in and the password reset.
// No screenshot exists for these screens (docs/not-from-reference.md); the copy and states live here.
import { OTP_RESEND_SECONDS, emailSchema, formatIndianMobile, normalizePhone, type OtpChannel } from '@spacebasic/shared';
import { ApiError } from '../../api/client';

export { CODE_LENGTH, sanitizeCode } from '../../components/codeValue';

/** What a code screen needs. It travels in the router state (history.state), so a reload keeps it. */
export interface CodeSent {
  channel: OtpChannel;
  /** Normalised: lower-case email, or E.164 phone. */
  identifier: string;
  /** Date.now() when the code was sent, and the resend cooldown from the API. */
  sentAt: number;
  resendAfter: number;
}

export function parseCodeSent(state: unknown): CodeSent | null {
  if (typeof state !== 'object' || state === null) return null;
  const v = state as Record<string, unknown>;
  const channelOk = v.channel === 'email' || v.channel === 'sms' || v.channel === 'whatsapp';
  if (!channelOk || typeof v.identifier !== 'string' || !v.identifier) return null;
  if (typeof v.sentAt !== 'number' || typeof v.resendAfter !== 'number') return null;
  return { channel: v.channel as OtpChannel, identifier: v.identifier, sentAt: v.sentAt, resendAfter: v.resendAfter };
}

/** Whole seconds until "Resend code" is available again (never negative). */
export function secondsLeft(sentAt: number, resendAfter: number, now: number): number {
  return Math.max(0, Math.ceil((sentAt + resendAfter * 1000 - now) / 1000));
}

/** 30 -> "0:30", 75 -> "1:15". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "+919876543210" -> "+91 98765 43210"; other numbers are shown as stored. */
export function displayPhone(e164: string): string {
  return e164.startsWith('+91') && e164.length === 13 ? `+91 ${formatIndianMobile(e164.slice(3))}` : e164;
}

/** The end of "We sent a four-digit code to …". */
export function describeTarget(channel: OtpChannel, identifier: string): string {
  if (channel === 'email') return identifier;
  return channel === 'whatsapp' ? `${displayPhone(identifier)} on WhatsApp` : displayPhone(identifier);
}

/** What to put back in the Sign in field when the user goes Back: the email, or "98765 43210". */
export function prefillFor(channel: OtpChannel, identifier: string): string {
  if (channel === 'email') return identifier;
  return identifier.startsWith('+91') && identifier.length === 13 ? formatIndianMobile(identifier.slice(3)) : identifier;
}

/** The `prefill` value in a screen's router state (Back from a code screen, or "Forgot password?"). */
export function prefillOf(state: unknown): string {
  if (typeof state !== 'object' || state === null) return '';
  const v = (state as Record<string, unknown>).prefill;
  return typeof v === 'string' ? v : '';
}

/** Client-side check before asking for a code, with the same messages as the shared zod schemas. */
export function validateTarget(channel: OtpChannel, raw: string): { identifier: string } | { error: string } {
  if (channel === 'email') {
    const r = emailSchema.safeParse(raw);
    return r.success ? { identifier: r.data } : { error: r.error.issues[0]?.message ?? 'Enter a valid email address' };
  }
  if (!raw.trim()) return { error: 'Enter your mobile number' };
  const phone = normalizePhone(raw);
  return phone ? { identifier: phone } : { error: 'Enter a valid 10-digit mobile number' };
}

/**
 * A 429 inside the resend cooldown means a code was sent moments ago (for example the user went Back and asked
 * again). The code screen then opens with the time left. Longer limits (5 an hour) are shown as errors.
 */
export function cooldownFrom(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.status !== 429 || err.retryAfter === undefined) return null;
  return err.retryAfter <= OTP_RESEND_SECONDS ? err.retryAfter : null;
}

export const WRONG_CODE_MESSAGE = 'That code is wrong or has expired. Check it, or ask for a new one.';
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/** Message for a failed request on a code screen. A wrong or expired code gets a code-specific message. */
export function errorMessage(err: unknown, field?: string): string {
  if (!(err instanceof ApiError)) return FALLBACK_MESSAGE;
  if (err.code === 'INVALID_CREDENTIALS') return WRONG_CODE_MESSAGE;
  // The hourly limit (5 codes an hour) can mean a long wait; "wait a moment" would mislead.
  if (err.status === 429 && err.retryAfter !== undefined && err.retryAfter > 90) {
    const min = Math.ceil(err.retryAfter / 60);
    return `Too many attempts. Please try again in ${min} minute${min === 1 ? '' : 's'}.`;
  }
  return (field ? err.fields?.[field] : undefined) ?? err.fields?.code ?? err.fields?.identifier ?? err.fields?.email ?? err.message ?? FALLBACK_MESSAGE;
}
