import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  CLIENT_HEADER, REFRESH_COOKIE, changePasswordBodySchema, forgotPasswordBodySchema, loginBodySchema,
  otpRequestBodySchema, otpVerifyBodySchema, resetPasswordBodySchema, type OtpRequestResult,
} from '@spacebasic/shared';
import { env } from '../../config/env';
import { errors } from '../../core/http/errors';
import { validate, valid } from '../../core/middleware/validate';
import { authenticate } from '../../core/middleware/auth';
import type { Limiters } from '../../core/middleware/rateLimit';
import { clearRefreshCookie, setRefreshCookie } from '../../core/security/cookies';
import * as auth from './auth.service';

function meta(req: Request): auth.RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined, requestId: req.requestId };
}

/** CSRF defence for the cookie-authenticated endpoints: custom header + Origin allow-list. */
const cookieEndpointGuard: RequestHandler = (req, _res, next) => {
  if (req.get(CLIENT_HEADER) !== '1') return next(errors.forbidden());
  const origin = req.get('origin');
  if (origin && !env.APP_ORIGINS.includes(origin)) return next(errors.forbidden());
  next();
};

const noStore: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

/** Send the 202 first, then deliver the code, so response time doesn't depend on whether the account exists. */
function respondThenDeliver(res: Response, resendAfter: number, deliver: () => Promise<void>, requestId: string) {
  const body: OtpRequestResult = { sent: true, resendAfter };
  res.status(202).json(body);
  setImmediate(() => { deliver().catch((err) => console.error(`[${requestId}] OTP delivery failed:`, (err as Error).message)); });
}

export function authRouter(limiters: Limiters): Router {
  const r = Router();
  r.use(noStore);

  r.post('/login', limiters.authStrict, validate({ body: loginBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: loginBodySchema });
      const issued = await auth.loginWithPassword(body.email, body.password, meta(req));
      setRefreshCookie(res, issued.refreshToken, issued.expiresAt);
      res.json(issued.result);
    } catch (e) { next(e); }
  });

  r.post('/otp/request', limiters.otpSend, validate({ body: otpRequestBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: otpRequestBodySchema });
      const { resendAfter, deliver } = await auth.requestOtp(body.channel, body.identifier, 'login');
      respondThenDeliver(res, resendAfter, deliver, req.requestId);
    } catch (e) { next(e); }
  });

  r.post('/otp/verify', limiters.authStrict, validate({ body: otpVerifyBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: otpVerifyBodySchema });
      const issued = await auth.loginWithOtp(body.channel, body.identifier, body.code, meta(req));
      setRefreshCookie(res, issued.refreshToken, issued.expiresAt);
      res.json(issued.result);
    } catch (e) { next(e); }
  });

  r.post('/refresh', cookieEndpointGuard, async (req, res, next) => {
    try {
      const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (!token) throw errors.unauthenticated();
      const outcome = await auth.refresh(token, meta(req));
      if (outcome.kind === 'ok') {
        setRefreshCookie(res, outcome.issued.refreshToken, outcome.issued.expiresAt);
        res.json(outcome.issued.result);
        return;
      }
      if (outcome.kind === 'race') throw errors.refreshRace(); // keep the cookie: the other tab set a new one
      clearRefreshCookie(res);
      // No active consent for the current policy (a new version, or withdrawn): sign in again with the box ticked.
      if (outcome.kind === 'consent_required') throw errors.consentRequired();
      throw errors.unauthenticated();
    } catch (e) { next(e); }
  });

  r.post('/logout', cookieEndpointGuard, async (req, res, next) => {
    try {
      await auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
      clearRefreshCookie(res);
      res.status(204).end();
    } catch (e) { next(e); }
  });

  r.post('/password/forgot', limiters.otpSend, validate({ body: forgotPasswordBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: forgotPasswordBodySchema });
      const { resendAfter, deliver } = await auth.requestOtp('email', body.email, 'reset_password');
      respondThenDeliver(res, resendAfter, deliver, req.requestId);
    } catch (e) { next(e); }
  });

  r.post('/password/reset', limiters.authStrict, validate({ body: resetPasswordBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: resetPasswordBodySchema });
      await auth.resetPassword(body.email, body.code, body.newPassword, meta(req));
      clearRefreshCookie(res);
      res.status(204).end();
    } catch (e) { next(e); }
  });

  r.post('/password/change', authenticate, validate({ body: changePasswordBodySchema }), async (req, res, next) => {
    try {
      const { body } = valid(req, { body: changePasswordBodySchema });
      await auth.changePassword(req.ctx!, body.currentPassword, body.newPassword, meta(req));
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
