import { Router, type RequestHandler } from 'express';
import { withdrawConsentBodySchema } from '@spacebasic/shared';
import { authenticate, requirePermission } from '../../core/middleware/auth';
import { validate } from '../../core/middleware/validate';
import { clearRefreshCookie } from '../../core/security/cookies';
import * as consent from './consent.service';

const noStore: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

// Consent module (docs/api.md "Consent"). The Privacy & Consent screen (Profile > ACCOUNT) uses these.
export function consentRouter(): Router {
  const r = Router();

  // Public: the sign-in screens show which policy version the consent box refers to.
  r.get('/policy', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(consent.policy());
  });

  r.get('/me', authenticate, requirePermission('consent:read'), noStore, async (req, res, next) => {
    try {
      res.json(await consent.myConsent(req.ctx!));
    } catch (e) { next(e); }
  });

  // Ends every session, this one included, and clears the refresh cookie: the client goes back to sign-in.
  r.post('/withdraw', authenticate, requirePermission('consent:withdraw'), noStore, validate({ body: withdrawConsentBodySchema }), async (req, res, next) => {
    try {
      await consent.withdrawConsent(req.ctx!, { requestId: req.requestId });
      clearRefreshCookie(res);
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
