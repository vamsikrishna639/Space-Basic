// Error codes shared by server responses and client messages (docs/api.md "Conventions").

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'INVALID_CREDENTIALS',
  'REFRESH_RACE',
  'FORBIDDEN',
  'CONSENT_REQUIRED',
  'NOT_FOUND',
  'CONFLICT',
  'ALREADY_SCANNED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'OTP_UNAVAILABLE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
}
