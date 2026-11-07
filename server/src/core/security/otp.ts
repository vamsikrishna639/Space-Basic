import crypto from 'node:crypto';
import { env } from '../../config/env';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** 4-digit code (sign-in screen: "We'll send a four-digit code to your phone"). */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 10_000)).padStart(4, '0');
}

/** HMAC-SHA256 with the server pepper, bound to purpose + identifier (codes can't be replayed elsewhere). */
export function hashOtp(code: string, identifier: string, purpose: string): string {
  return crypto.createHmac('sha256', env.OTP_PEPPER).update(`${purpose}\n${identifier}\n${code}`).digest('hex');
}

export function otpMatches(code: string, identifier: string, purpose: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(code, identifier, purpose), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
