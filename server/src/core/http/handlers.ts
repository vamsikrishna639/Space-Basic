import crypto from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@spacebasic/shared';
import { AppError } from './errors';
import { env } from '../../config/env';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

export const notFound: RequestHandler = (req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Not found.'));

function body(err: AppError, requestId: string): ApiErrorBody {
  return { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}), requestId } };
}

// Central error handler: AppError -> its status; known library errors mapped; everything else 500 without details.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err?.type === 'entity.too.large') e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'That request is too large.');
  else if (err?.type === 'entity.parse.failed') e = new AppError(400, 'VALIDATION_ERROR', 'The request body is not valid JSON.');
  else if (err?.code === 11000) e = new AppError(409, 'CONFLICT', 'That already exists.');
  else {
    e = new AppError(500, 'INTERNAL', 'Something went wrong on our side. Please try again.');
    // log without request bodies (they can contain passwords / codes)
    console.error(`[${req.requestId}] ${req.method} ${req.originalUrl} ->`, env.isProd ? (err?.message ?? err) : err);
  }
  if (e.headers) for (const [k, v] of Object.entries(e.headers)) res.setHeader(k, v);
  res.status(e.status).json(body(e, req.requestId));
};
