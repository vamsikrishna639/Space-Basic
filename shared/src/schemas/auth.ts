import { z } from 'zod';
import { consentSchema, emailSchema, loginPasswordSchema, otpCodeSchema, passwordSchema, phoneSchema } from './common';
import type { Me } from './users';

export const loginBodySchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
  consent: consentSchema,
});
export type LoginBody = z.input<typeof loginBodySchema>;

export const OTP_CHANNELS = ['email', 'sms', 'whatsapp'] as const;
export type OtpChannel = (typeof OTP_CHANNELS)[number];

/** identifier = email for channel 'email', phone (normalised to E.164) for 'sms' / 'whatsapp'. */
const otpTarget = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('email'), identifier: emailSchema }),
  z.object({ channel: z.literal('sms'), identifier: phoneSchema }),
  z.object({ channel: z.literal('whatsapp'), identifier: phoneSchema }),
]);

export const otpRequestBodySchema = z.intersection(otpTarget, z.object({ purpose: z.literal('login'), consent: consentSchema }));
export type OtpRequestBody = z.input<typeof otpRequestBodySchema>;

export const otpVerifyBodySchema = z.intersection(otpTarget, z.object({ code: otpCodeSchema, consent: consentSchema }));
export type OtpVerifyBody = z.input<typeof otpVerifyBodySchema>;

export const forgotPasswordBodySchema = z.object({ email: emailSchema });
export const resetPasswordBodySchema = z.object({ email: emailSchema, code: otpCodeSchema, newPassword: passwordSchema });
export const changePasswordBodySchema = z
  .object({ currentPassword: loginPasswordSchema, newPassword: passwordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, { path: ['newPassword'], error: 'Choose a password you have not used here' });

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: Me;
}

export interface OtpRequestResult {
  sent: true;
  resendAfter: number;
}

/** Cookie name and the header that cookie-authenticated endpoints require (CSRF defence). */
export const REFRESH_COOKIE = 'sb_rt';
export const CLIENT_HEADER = 'x-sb-client';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const OTP_RESEND_SECONDS = 30;
