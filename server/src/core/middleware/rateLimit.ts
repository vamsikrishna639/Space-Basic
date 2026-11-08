import rateLimit, { type Options } from 'express-rate-limit';
import { errors } from '../http/errors';

// Per-IP limits (in-memory store: one Render instance). Per-identifier limits that must survive a restart
// use Mongo counters (core/db/counters.ts). Values from docs/api.md "Rate limits".
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
  return {
    global: limiter(5 * 60_000, 300),
    authStrict: limiter(15 * 60_000, 20),
    otpSend: limiter(60 * 60_000, 30),
    // Per scanner (signed-in user), not per IP: several wardens may share one hostel network. Runs after authenticate.
    attendanceScan: limiter(60_000, 120, { keyGenerator: (req) => `scanner:${String(req.ctx?.userId ?? 'anonymous')}` }),
  };
}
export type Limiters = ReturnType<typeof createLimiters>;
