import { Router, type RequestHandler } from 'express';
import {
  createFloorBodySchema, createHostelBodySchema, floorCodeParamsSchema, generateRoomsBodySchema, listRoomsQuerySchema,
  roomCodeParamsSchema, updateRoomBodySchema,
} from '@spacebasic/shared';
import { authenticate, requirePermission } from '../../core/middleware/auth';
import { validate, valid } from '../../core/middleware/validate';
import * as hostel from './hostel.service';

const noStore: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

// Hostel module (docs/api.md "Hostel"). Reads: wardens and admins (hostel:read). Writes: admins (hostel:manage).
// A student's own room comes with GET /users/me, so students have no access here.
export function hostelRouter(): Router {
  const r = Router();
  r.use(authenticate, noStore);

  r.get('/structure', requirePermission('hostel:read'), async (req, res, next) => {
    try {
      res.json(await hostel.structure(req.ctx!));
    } catch (e) { next(e); }
  });

  r.get('/rooms', requirePermission('hostel:read'), validate({ query: listRoomsQuerySchema }), async (req, res, next) => {
    try {
      const { query } = valid(req, { query: listRoomsQuerySchema });
      res.json(await hostel.listRooms(req.ctx!, query));
    } catch (e) { next(e); }
  });

  r.post('/hostels', requirePermission('hostel:manage'), validate({ body: createHostelBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: createHostelBodySchema });
      res.status(201).json(await hostel.createHostel(req.ctx!, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.post('/floors', requirePermission('hostel:manage'), validate({ body: createFloorBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: createFloorBodySchema });
      res.status(201).json(await hostel.createFloor(req.ctx!, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.post('/floors/:code/rooms/generate', requirePermission('hostel:manage'), validate({ params: floorCodeParamsSchema, body: generateRoomsBodySchema }), async (req, res, next) => {
    try {
      const { params, body } = valid(req, { params: floorCodeParamsSchema, body: generateRoomsBodySchema });
      res.json(await hostel.generateRooms(req.ctx!, params.code, body.hostelCode, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.patch('/rooms/:code', requirePermission('hostel:manage'), validate({ params: roomCodeParamsSchema, body: updateRoomBodySchema }), async (req, res, next) => {
    try {
      const { params, body } = valid(req, { params: roomCodeParamsSchema, body: updateRoomBodySchema });
      res.json(await hostel.updateRoom(req.ctx!, params.code, body.beds, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  return r;
}
