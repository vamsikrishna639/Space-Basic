import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { hasPermission, type Permission } from '@spacebasic/shared';
import { errors } from '../http/errors';
import { verifyAccessToken } from '../security/tokens';
import { SessionModel } from '../../modules/auth/auth.models';
import { UserModel } from '../../modules/users/user.model';

/**
 * Verify the Bearer access token, then confirm the session is still live and the user still active
 * (so logout, consent withdrawal, password change and disabling take effect immediately, not after 15 min).
 * Sets req.ctx; institutionId always comes from the verified token, never from the request.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.get('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) throw errors.unauthenticated();
    const claims = verifyAccessToken(m[1]!.trim());
    if (![claims.sub, claims.inst, claims.sid].every((id) => Types.ObjectId.isValid(id))) throw errors.unauthenticated();
    const institutionId = new Types.ObjectId(claims.inst);
    const now = new Date();
    const [session, user] = await Promise.all([
      SessionModel.findOne({ _id: claims.sid, institutionId, userId: claims.sub, revokedAt: null, expiresAt: { $gt: now } }, { _id: 1 }).lean(),
      UserModel.findOne({ _id: claims.sub, institutionId, status: 'active' }, { roles: 1 }).lean(),
    ]);
    if (!session || !user) throw errors.unauthenticated();
    req.ctx = { userId: user._id, institutionId, roles: user.roles, sessionId: session._id };
    next();
  } catch (err) {
    next(err);
  }
};

/** RBAC: routes declare permissions (shared/roles.ts), never role names. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.ctx) return next(errors.unauthenticated());
    if (!hasPermission(req.ctx.roles, permission)) return next(errors.forbidden());
    next();
  };
}
