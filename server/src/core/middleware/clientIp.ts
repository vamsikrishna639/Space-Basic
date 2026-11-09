import net from 'node:net';
import type { RequestHandler } from 'express';
import type { ClientIpHeader } from '../../config/env';

// The caller's address for rate limits and audit (docs/decisions.md 2026-11-09, "CLIENT_IP_HEADER").
//
// In production the API sits behind Vercel's external rewrite, then Render's edge and load balancer. Vercel passes a
// visitor's own X-Forwarded-For through as the first entry, so no TRUST_PROXY count can pick the visitor out of it
// without trusting a value the visitor wrote. Vercel also sends a header it sets itself (x-real-ip); when
// CLIENT_IP_HEADER names it, req.ip becomes that header's address. Otherwise (or if the header is missing or not an
// IP address) req.ip stays what Express derives from TRUST_PROXY.

/** The first address in a header value, if it is a valid IP address. */
export function headerIp(value: string | undefined): string | undefined {
  const first = value?.split(',')[0]?.trim();
  return first && net.isIP(first) ? first : undefined;
}

export function clientIp(header: ClientIpHeader | undefined): RequestHandler {
  return (req, _res, next) => {
    const ip = header ? headerIp(req.get(header)) : undefined;
    // req.ip is a getter on Express's request prototype; an own property on this request shadows it, so every
    // reader (express-rate-limit, the audit log) sees the same address.
    if (ip) Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
    next();
  };
}
