import type { OtpChannel } from '@spacebasic/shared';
import type { OtpDelivery } from './message';
export type { OtpDelivery, OtpMessage } from './message';
import { env } from '../../config/env';
import { consoleDelivery } from './console';
import { gmailApiDelivery } from './gmailApi';
import { gmailSmtpDelivery } from './gmailSmtp';

/**
 * Provider for a channel, or null when that channel is unavailable (the API answers 503 OTP_UNAVAILABLE).
 *  - email: OTP_PROVIDER (console / gmail-smtp / gmail-api); empty = disabled
 *  - sms / whatsapp: console only for now; in production only when ALLOW_CONSOLE_OTP=true
 */
export function deliveryFor(channel: OtpChannel): OtpDelivery | null {
  if (channel === 'email') {
    switch (env.OTP_PROVIDER) {
      case 'console': return consoleDelivery;
      case 'gmail-smtp': return gmailSmtpDelivery;
      case 'gmail-api': return gmailApiDelivery;
      default: return null;
    }
  }
  if (!env.isProd || env.ALLOW_CONSOLE_OTP) return consoleDelivery;
  return null;
}
