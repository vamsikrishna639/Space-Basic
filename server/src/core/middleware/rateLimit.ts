import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../../config/env';
import { errors } from '../http/errors';

// Per-IP limits (in-memory store: one Render instance). Per-identifier limits that must survive a restart
// use Mongo counters (core/db/counters.ts). Values from docs/api.md "Rate limits".

/** Sign-in and one-time-code limits. Production ALWAYS gets exactly these (pinned by rateLimit.test.ts). */
export const PRODUCTION_LIMITS = {
  /** Per IP: login, code verify, password reset. */
  authStrict: { windowMs: 15 * 60_000, limit: 20 },
  /** Per IP: code requests and "forgot password". */
  otpSend: { windowMs: 60 * 60_000, limit: 30 },
  /** Per email, failed password sign-ins in 15 minutes (cleared by a success). */
  loginFailsPerEmail: 10,
  /** Per address and purpose, codes sent in an hour. */
  codesPerAddressHourly: 5,
} as const;

export type SignInLimits = { -readonly [K in keyof typeof PRODUCTION_LIMITS]: (typeof PRODUCTION_LIMITS)[K] extends number ? number : { windowMs: number; limit: number } };

/**
 * RELAX_RATE_LIMITS=true (development and tests only; refused when NODE_ENV=production, config/env.ts) raises the
 * sign-in and code limits so repeated smoke runs don't lock themselves out. The windows, the 30 s resend
 * cooldown, the 5 attempts per code and every other limit stay as they are.
 */
export function limitsFor(relaxed: boolean): SignInLimits {
  if (!relaxed) return structuredClone(PRODUCTION_LIMITS) as SignInLimits;
  return {
    authStrict: { windowMs: PRODUCTION_LIMITS.authStrict.windowMs, limit: 1000 },
    otpSend: { windowMs: PRODUCTION_LIMITS.otpSend.windowMs, limit: 1000 },
    loginFailsPerEmail: 1000,
    codesPerAddressHourly: 100,
  };
}

/** The limits this process uses. */
export const signInLimits = (): SignInLimits => limitsFor(env.RELAX_RATE_LIMITS);

function limiter(windowMs: number, limit: number, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next, options) => next(errors.rateLimited(options.windowMs / 1000)),
    ...extra,
  });
}

export function createLimiters() {
  const l = signInLimits();
  return {
    global: limiter(5 * 60_000, 300),
    authStrict: limiter(l.authStrict.windowMs, l.authStrict.limit),
    otpSend: limiter(l.otpSend.windowMs, l.otpSend.limit),
    // Per scanner (signed-in user), not per IP: several wardens may share one hostel network. Runs after authenticate.
    attendanceScan: limiter(60_000, 120, { keyGenerator: (req) => `scanner:${String(req.ctx?.userId ?? 'anonymous')}` }),
  };
}
export type Limiters = ReturnType<typeof createLimiters>;
