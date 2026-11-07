import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { errors } from '../http/errors';

type Schemas = { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };
type Out<S> = S extends z.ZodType ? z.output<S> : undefined;
export type Valid<S extends Schemas> = { body: Out<S['body']>; query: Out<S['query']>; params: Out<S['params']> };

function toFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Validate body / query / params with zod (schemas from @spacebasic/shared) and put the typed, parsed
 * values on req.valid. Unknown keys are stripped by zod objects. Express 5's req.query is read-only, so
 * handlers must read req.valid, never req.body / req.query directly.
 */
export function validate<S extends Schemas>(schemas: S): RequestHandler {
  return (req, _res, next) => {
    const valid: Record<string, unknown> = {};
    const fields: Record<string, string> = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const input = part === 'body' ? (req.body ?? {}) : part === 'query' ? req.query : req.params;
      const r = schema.safeParse(input);
      if (r.success) valid[part] = r.data;
      else Object.assign(fields, toFields(r.error));
    }
    if (Object.keys(fields).length) return next(errors.validation(fields));
    req.valid = valid;
    next();
  };
}

/** Read the parsed values in a handler with types. */
export function valid<S extends Schemas>(req: Express.Request, _schemas: S): Valid<S> {
  return req.valid as Valid<S>;
}
