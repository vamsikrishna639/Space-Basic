import { z } from 'zod';
import { normalizePhone } from '../phone';
import { CONSENT_POLICY_VERSION } from '../consent';

export const emailSchema = z
  .string({ error: 'Enter your email address' })
  .trim()
  .toLowerCase()
  .max(254, { error: 'Email is too long' })
  .pipe(z.email({ error: 'Enter a valid email address' }));

/** Accepts "98765 43210", "9876543210", "+919876543210" ... and outputs E.164. */
export const phoneSchema = z
  .string({ error: 'Enter your mobile number' })
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) { ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' }); return z.NEVER; }
    return n;
  });

export const passwordSchema = z
  .string({ error: 'Enter a password' })
  .min(8, { error: 'Use at least 8 characters' })
  .max(128, { error: 'Use at most 128 characters' });

/** Password as typed at sign-in: no rules beyond length bounds (don't leak the policy on login). */
export const loginPasswordSchema = z.string({ error: 'Enter your password' }).min(1, { error: 'Enter your password' }).max(128);

export const otpCodeSchema = z.string({ error: 'Enter the 4-digit code' }).regex(/^\d{4}$/, { error: 'Enter the 4-digit code' });

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, { error: 'Invalid id' });

export const consentSchema = z.object(
  {
    accepted: z.literal(true, { error: 'Tick the consent box to continue' }),
    policyVersion: z.literal(CONSENT_POLICY_VERSION, { error: 'Please review the latest privacy policy' }),
  },
  { error: 'Tick the consent box to continue' },
);

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
