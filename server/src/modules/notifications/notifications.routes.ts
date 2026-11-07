import { Router, type RequestHandler } from 'express';
import { listNotificationsQuerySchema, notificationIdParamsSchema } from '@spacebasic/shared';
import { authenticate, requirePermission } from '../../core/middleware/auth';
import { requireModule } from '../../core/middleware/module';
import { validate, valid } from '../../core/middleware/validate';
import * as notifications from './notifications.service';

const noStore: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

// Notifications module (docs/api.md "Notifications"): own notifications only, for every role.
export function notificationsRouter(): Router {
  const r = Router();
  r.use(authenticate, requireModule('notifications'), noStore);

  r.get('/', requirePermission('notifications:read'), validate({ query: listNotificationsQuerySchema }), async (req, res, next) => {
    try {
      const { query } = valid(req, { query: listNotificationsQuerySchema });
      res.json(await notifications.list(req.ctx!, query));
    } catch (e) { next(e); }
  });

  r.get('/unread-count', requirePermission('notifications:read'), async (req, res, next) => {
    try {
      res.json(await notifications.unreadCount(req.ctx!));
    } catch (e) { next(e); }
  });

  r.post('/:id/read', requirePermission('notifications:mark_read'), validate({ params: notificationIdParamsSchema }), async (req, res, next) => {
    try {
      const { params } = valid(req, { params: notificationIdParamsSchema });
      await notifications.markRead(req.ctx!, params.id);
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
