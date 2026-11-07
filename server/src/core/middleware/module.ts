import type { RequestHandler } from 'express';
import { MODULES, type ModuleKey } from '@spacebasic/shared';
import { errors } from '../http/errors';
import { InstitutionModel } from '../../modules/institutions/institution.model';

/**
 * Module gate (docs/architecture.md §3 and §7): the module must be live in the registry AND enabled for the
 * caller's institution. Otherwise the route answers 404, as if it didn't exist. Runs after authenticate.
 */
export function requireModule(key: ModuleKey): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.ctx) throw errors.unauthenticated();
      if (MODULES[key].status !== 'live') throw errors.notFound();
      const inst = await InstitutionModel.findById(req.ctx.institutionId, { enabledModules: 1, status: 1 }).lean();
      if (!inst || inst.status !== 'active' || !inst.enabledModules.includes(key)) throw errors.notFound();
      next();
    } catch (err) {
      next(err);
    }
  };
}
