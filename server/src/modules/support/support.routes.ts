import { Router, type RequestHandler } from 'express';
import {
  createContactBodySchema, createFaqBodySchema, hasPermission, listFaqsQuerySchema, supportIdParamsSchema,
  updateContactBodySchema, updateFaqBodySchema,
} from '@spacebasic/shared';
import { errors } from '../../core/http/errors';
import { authenticate, requirePermission } from '../../core/middleware/auth';
import { requireModule } from '../../core/middleware/module';
import { validate, valid } from '../../core/middleware/validate';
import * as support from './support.service';

const noStore: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

// Support / Help module (docs/api.md "Support"). Reads: every signed-in role (support:read).
// Writes: admins (support:manage), through the API only (no admin screens in Phase 1).
export function supportRouter(): Router {
  const r = Router();
  r.use(authenticate, requireModule('support'), noStore);
  const manage = requirePermission('support:manage');

  r.get('/contacts', requirePermission('support:read'), async (req, res, next) => {
    try {
      res.json(await support.listContacts(req.ctx!));
    } catch (e) { next(e); }
  });

  r.post('/contacts', manage, validate({ body: createContactBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: createContactBodySchema });
      res.status(201).json(await support.createContact(req.ctx!, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.patch('/contacts/:id', manage, validate({ params: supportIdParamsSchema, body: updateContactBodySchema }), async (req, res, next) => {
    try {
      const { params, body } = valid(req, { params: supportIdParamsSchema, body: updateContactBodySchema });
      res.json(await support.updateContact(req.ctx!, params.id, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.delete('/contacts/:id', manage, validate({ params: supportIdParamsSchema }), async (req, res, next) => {
    try {
      const { params } = valid(req, { params: supportIdParamsSchema });
      await support.deleteContact(req.ctx!, params.id, { requestId: req.requestId });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  r.get('/faqs', requirePermission('support:read'), validate({ query: listFaqsQuerySchema }), async (req, res, next) => {
    try {
      const { query } = valid(req, { query: listFaqsQuerySchema });
      if (query.includeUnpublished && !hasPermission(req.ctx!.roles, 'support:manage')) throw errors.forbidden();
      res.json(await support.listFaqs(req.ctx!, query));
    } catch (e) { next(e); }
  });

  r.post('/faqs', manage, validate({ body: createFaqBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: createFaqBodySchema });
      res.status(201).json(await support.createFaq(req.ctx!, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.patch('/faqs/:id', manage, validate({ params: supportIdParamsSchema, body: updateFaqBodySchema }), async (req, res, next) => {
    try {
      const { params, body } = valid(req, { params: supportIdParamsSchema, body: updateFaqBodySchema });
      res.json(await support.updateFaq(req.ctx!, params.id, body, { requestId: req.requestId }));
    } catch (e) { next(e); }
  });

  r.delete('/faqs/:id', manage, validate({ params: supportIdParamsSchema }), async (req, res, next) => {
    try {
      const { params } = valid(req, { params: supportIdParamsSchema });
      await support.deleteFaq(req.ctx!, params.id, { requestId: req.requestId });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
