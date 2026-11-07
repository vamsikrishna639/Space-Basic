import type { Response } from 'express';
import { REFRESH_COOKIE } from '@spacebasic/shared';
import { env } from '../../config/env';

// The refresh-token cookie (docs/architecture.md §4.2): httpOnly, Secure in production, SameSite=Lax, and
// sent only to the auth routes. Any route may clear it (consent withdrawal does), as long as the options match.
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function setRefreshCookie(res: Response, token: string, expires: Date): void {
  res.cookie(REFRESH_COOKIE, token, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: REFRESH_COOKIE_PATH, expires });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: REFRESH_COOKIE_PATH });
}
