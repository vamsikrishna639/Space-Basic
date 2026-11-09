import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { CLIENT_HEADER } from '@spacebasic/shared';
import { CLIENT_IP_HEADERS, env } from './config/env';
import { requestId, notFound, errorHandler } from './core/http/handlers';
import { sanitize } from './core/middleware/sanitize';
import { createLimiters } from './core/middleware/rateLimit';
import { clientIp, headerIp } from './core/middleware/clientIp';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { consentRouter } from './modules/consent/consent.routes';
import { hostelRouter } from './modules/hostel/hostel.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { attendanceRouter } from './modules/attendance/attendance.routes';
import { supportRouter } from './modules/support/support.routes';
import { institutionsRouter } from './modules/institutions/institutions.routes';

/** Build the Express app (no listen; Supertest uses this directly). Request pipeline: docs/architecture.md §3. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('query parser', 'simple'); // no nested objects in query strings (NoSQL-injection defence)

  const limiters = createLimiters();
  app.use(requestId);
  app.use(clientIp(env.CLIENT_IP_HEADER)); // before every rate limiter
  app.use(helmet());
  app.use(cors({ origin: env.APP_ORIGINS, credentials: true, allowedHeaders: ['content-type', 'authorization', CLIENT_HEADER, 'x-request-id'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitize);
  app.use(limiters.global);

  const api = express.Router();
  api.get('/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ status: 'ok', time: new Date().toISOString() }); });
  // Deployment check for the caller's address (docs/decisions.md 2026-11-09): the address the rate limits use, where
  // it came from, and the headers a proxy may set. Rate limits key on `ip`, so it must be the caller's own address,
  // not a proxy's, and not one the caller can make up. Shows callers only what their own request carried.
  api.get('/health/client', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const forwardedFor = (req.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const fromHeader = env.CLIENT_IP_HEADER && headerIp(req.get(env.CLIENT_IP_HEADER)) !== undefined;
    res.json({
      ip: req.ip,
      ipFrom: fromHeader ? env.CLIENT_IP_HEADER : `proxy chain (TRUST_PROXY=${env.TRUST_PROXY})`,
      clientIpHeader: env.CLIENT_IP_HEADER ?? null,
      headers: Object.fromEntries(CLIENT_IP_HEADERS.map((h) => [h, req.get(h) ?? null])),
      forwardedFor,
      trustProxy: env.TRUST_PROXY,
    });
  });
  api.use('/auth', authRouter(limiters));
  api.use('/users', usersRouter());
  api.use('/consent', consentRouter());
  api.use('/hostel', hostelRouter());
  api.use('/notifications', notificationsRouter());
  api.use('/attendance', attendanceRouter(limiters));
  api.use('/support', supportRouter());
  api.use('/institutions', institutionsRouter());
  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
