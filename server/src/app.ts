import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { CLIENT_HEADER } from '@spacebasic/shared';
import { env } from './config/env';
import { requestId, notFound, errorHandler } from './core/http/handlers';
import { sanitize } from './core/middleware/sanitize';
import { createLimiters } from './core/middleware/rateLimit';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';

/** Build the Express app (no listen; Supertest uses this directly). Request pipeline: docs/architecture.md §3. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('query parser', 'simple'); // no nested objects in query strings (NoSQL-injection defence)

  const limiters = createLimiters();
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: env.APP_ORIGINS, credentials: true, allowedHeaders: ['content-type', 'authorization', CLIENT_HEADER, 'x-request-id'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitize);
  app.use(limiters.global);

  const api = express.Router();
  api.get('/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ status: 'ok', time: new Date().toISOString() }); });
  api.use('/auth', authRouter(limiters));
  api.use('/users', usersRouter());
  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
