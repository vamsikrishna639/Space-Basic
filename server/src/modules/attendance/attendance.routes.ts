import { Router, type RequestHandler } from 'express';
import { attendanceQuerySchema, myAttendanceQuerySchema, scanBodySchema } from '@spacebasic/shared';
import { authenticate, requirePermission } from '../../core/middleware/auth';
import { requireModule } from '../../core/middleware/module';
import type { Limiters } from '../../core/middleware/rateLimit';
import { validate, valid } from '../../core/middleware/validate';
import * as attendance from './attendance.service';

const noStore: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

// QR attendance module (docs/api.md "Attendance"). Nothing here may be cached: the QR token in particular
// must never outlive the session (PWA rule: no cached authenticated responses).
export function attendanceRouter(limiters: Limiters): Router {
  const r = Router();
  r.use(authenticate, requireModule('attendance'), noStore);

  // Student Entry Pass: a fresh single-use token every 10 s.
  r.get('/qr-token', requirePermission('attendance:qr:issue'), (req, res) => {
    res.json(attendance.issueQrToken(req.ctx!));
  });

  r.get('/me', requirePermission('attendance:read:own'), validate({ query: myAttendanceQuerySchema }), async (req, res, next) => {
    try {
      const { query } = valid(req, { query: myAttendanceQuerySchema });
      res.json(await attendance.myAttendance(req.ctx!, query));
    } catch (e) { next(e); }
  });

  // Warden scanner.
  r.post('/scan', requirePermission('attendance:scan'), limiters.attendanceScan, validate({ body: scanBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: scanBodySchema });
      res.status(201).json(await attendance.scan(req.ctx!, body.token, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.get('/', requirePermission('attendance:read'), validate({ query: attendanceQuerySchema }), async (req, res, next) => {
    try {
      const { query } = valid(req, { query: attendanceQuerySchema });
      res.json(await attendance.dayList(req.ctx!, query));
    } catch (e) { next(e); }
  });

  return r;
}
