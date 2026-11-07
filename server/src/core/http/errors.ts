import type { ErrorCode } from '@spacebasic/shared';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** One generic sign-in failure message for every cause (no user enumeration). */
export const INVALID_CREDENTIALS_MESSAGE = "We couldn't sign you in with those details.";

export const errors = {
  validation: (fields: Record<string, string>, message = 'Please check the highlighted fields.') =>
    new AppError(400, 'VALIDATION_ERROR', message, fields),
  unauthenticated: (message = 'Please sign in to continue.') => new AppError(401, 'UNAUTHENTICATED', message),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', 'Your session needs to be refreshed.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE),
  refreshRace: () => new AppError(401, 'REFRESH_RACE', 'Please try again.'),
  forbidden: (message = "You don't have access to this.") => new AppError(403, 'FORBIDDEN', message),
  consentRequired: () => new AppError(403, 'CONSENT_REQUIRED', 'Tick the consent box to continue.'),
  notFound: (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message: string, fields?: Record<string, string>) => new AppError(409, 'CONFLICT', message, fields),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.', undefined, {
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    }),
  otpUnavailable: () => new AppError(503, 'OTP_UNAVAILABLE', 'One-time codes are not available right now. Please sign in with your password.'),
};
