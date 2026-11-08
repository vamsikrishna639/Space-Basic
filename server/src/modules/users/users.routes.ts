import { Router, type RequestHandler } from 'express';
import {
  assignRolesBodySchema, createUserBodySchema, importUsersBodySchema, listUsersQuerySchema,
  updateUserBodySchema, userIdParamsSchema,
} from '@spacebasic/shared';
import { errors } from '../../core/http/errors';
import { authenticate, requirePermission } from '../../core/middleware/auth';
import { validate, valid } from '../../core/middleware/validate';
import { checkImageUpload, deleteAssets, rawImage, replaceAsset, sendAsset } from '../assets/asset.service';
import { avatarUrlFor, buildMe } from './me.service';
import { UserModel } from './user.model';
import * as users from './users.service';

const noStore: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

export function usersRouter(): Router {
  const r = Router();

  // ---- own profile ------------------------------------------------------------------------------------
  r.get('/me', authenticate, requirePermission('profile:read'), noStore, async (req, res, next) => {
    try {
      res.json(await buildMe(req.ctx!.institutionId, req.ctx!.userId));
    } catch (e) { next(e); }
  });

  // Fetched by the client with its Bearer token (an <img src> can't send one) and shown via a blob URL.
  // `private, no-cache` + ETag: a browser may keep it for this user but must revalidate; shared caches never store it.
  r.get('/me/avatar', authenticate, requirePermission('profile:read'), async (req, res, next) => {
    try {
      const { institutionId, userId } = req.ctx!;
      const user = await UserModel.findOne({ _id: userId, institutionId }, { avatar: 1 }).lean();
      if (!user?.avatar) throw errors.notFound('No photo yet.'); // the client shows the default avatar
      await sendAsset(req, res, { institutionId, _id: user.avatar.assetId, kind: 'avatar' }, 'private, no-cache');
    } catch (e) { next(e); }
  });

  r.put('/me/avatar', authenticate, requirePermission('profile:update'), rawImage, noStore, async (req, res, next) => {
    try {
      const { institutionId, userId } = req.ctx!;
      const image = checkImageUpload(req);
      const stored = await replaceAsset({ institutionId, ownerId: userId, kind: 'avatar' }, image);
      const avatar = { assetId: stored.assetId, updatedAt: stored.updatedAt };
      await UserModel.updateOne({ _id: userId, institutionId }, { $set: { avatar } });
      res.json({ avatarUrl: avatarUrlFor(avatar) });
    } catch (e) { next(e); }
  });

  r.delete('/me/avatar', authenticate, requirePermission('profile:update'), async (req, res, next) => {
    try {
      const { institutionId, userId } = req.ctx!;
      await UserModel.updateOne({ _id: userId, institutionId }, { $set: { avatar: null } });
      await deleteAssets({ institutionId, ownerId: userId, kind: 'avatar' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // ---- user management (institution_admin, super_admin; wardens read students) ------------------------
  r.get('/', authenticate, requirePermission('users:read'), noStore, validate({ query: listUsersQuerySchema }), async (req, res, next) => {
    try {
      const { query } = valid(req, { query: listUsersQuerySchema });
      res.json(await users.listUsers(req.ctx!, query));
    } catch (e) { next(e); }
  });

  r.post('/', authenticate, requirePermission('users:create'), noStore, validate({ body: createUserBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: createUserBodySchema });
      res.status(201).json(await users.createUser(req.ctx!, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  // Up to 500 rows of the same shape as POST /users (about 70 kB of JSON, inside the 100 kB body limit).
  r.post('/import', authenticate, requirePermission('users:import'), noStore, validate({ body: importUsersBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: importUsersBodySchema });
      res.json(await users.importUsers(req.ctx!, body.users, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.patch('/:id', authenticate, requirePermission('users:update'), noStore, validate({ params: userIdParamsSchema, body: updateUserBodySchema }), async (req, res, next) => {
    try {
      const { params, body } = valid(req, { params: userIdParamsSchema, body: updateUserBodySchema });
      res.json(await users.updateUser(req.ctx!, params.id, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.patch('/:id/roles', authenticate, requirePermission('users:assign_role'), noStore, validate({ params: userIdParamsSchema, body: assignRolesBodySchema }), async (req, res, next) => {
    try {
      const { params, body } = valid(req, { params: userIdParamsSchema, body: assignRolesBodySchema });
      res.json(await users.assignRoles(req.ctx!, params.id, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  return r;
}
