import { Router } from 'express';
import { authenticate, requirePermission } from '../../core/middleware/auth';
import { buildMe } from './me.service';

// Phase 1 Users/Profile module. This checkpoint only exposes GET /users/me (needed to exercise sign-in);
// avatar upload and the admin endpoints arrive with the Users/Profile module.
export function usersRouter(): Router {
  const r = Router();
  r.get('/me', authenticate, requirePermission('profile:read'), async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await buildMe(req.ctx!.institutionId, req.ctx!.userId));
    } catch (e) { next(e); }
  });
  return r;
}
