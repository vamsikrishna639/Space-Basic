import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { objectIdSchema } from '@spacebasic/shared';
import { errors } from '../../core/http/errors';
import { authenticate, requirePermission } from '../../core/middleware/auth';
import { validate, valid } from '../../core/middleware/validate';
import { checkImageUpload, rawImage, sendAsset } from '../assets/asset.service';
import { InstitutionModel } from './institution.model';
import { setLogo } from './institutions.service';

const idParams = z.object({ id: objectIdSchema });

// Institutions (docs/api.md "Institutions"). Phase 1 builds the logo only; PATCH /current and POST / follow
// with the admin needs that use them.
export function institutionsRouter(): Router {
  const r = Router();

  // Public: shown on Home (and could be shown before sign-in data loads). Versioned URL, so cacheable.
  r.get('/:id/logo', validate({ params: idParams }), async (req, res, next) => {
    try {
      const { params } = valid(req, { params: idParams });
      const inst = await InstitutionModel.findOne({ _id: new Types.ObjectId(params.id), status: 'active' }, { logo: 1 }).lean();
      if (!inst?.logo) throw errors.notFound();
      await sendAsset(req, res, { institutionId: inst._id, _id: inst.logo.assetId, kind: 'institution_logo' }, 'public, max-age=86400');
    } catch (e) { next(e); }
  });

  r.put('/current/logo', authenticate, requirePermission('institution:manage'), rawImage, async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const image = checkImageUpload(req);
      res.json(await setLogo(req.ctx!.institutionId, image, { actorId: req.ctx!.userId, requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  return r;
}
