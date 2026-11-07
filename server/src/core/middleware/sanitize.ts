import type { RequestHandler } from 'express';

/**
 * NoSQL-injection defence in depth: remove keys that start with "$" or contain "." from JSON bodies and
 * route params (e.g. {"email": {"$ne": null}} loses its operator). zod validation is the primary defence:
 * schemas expect strings, so operator objects never reach a query. Express 5 parses query strings with the
 * "simple" parser (no nested objects), so req.query cannot carry operators.
 */
function clean(value: unknown, depth = 0): unknown {
  if (depth > 20) return undefined;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  if (value && typeof value === 'object' && !(value instanceof Buffer)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = clean(v, depth + 1);
    }
    return out;
  }
  return value;
}

export const sanitize: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) req.body = clean(req.body);
  if (req.params) for (const k of Object.keys(req.params)) if (k.startsWith('$')) delete req.params[k];
  next();
};

export const _clean = clean; // exported for tests
