import type { OtpChannel } from '@spacebasic/shared';

export interface OtpMessage {
  channel: OtpChannel;
  to: string;
  code: string;
  purpose: 'login' | 'reset_password';
  expiresInMinutes: number;
}

/** One interface for every OTP delivery provider (decisions.md: console | gmail-api | gmail-smtp). */
export interface OtpDelivery {
  name: 'console' | 'gmail-api' | 'gmail-smtp';
  send(message: OtpMessage): Promise<void>;
}

export function otpText(m: OtpMessage): { subject: string; text: string } {
  const what = m.purpose === 'login' ? 'sign in to SpaceBasic' : 'reset your SpaceBasic password';
  return {
    subject: `Your SpaceBasic code: ${m.code}`,
    text: `Your code to ${what} is ${m.code}. It expires in ${m.expiresInMinutes} minutes. If you didn't ask for it, ignore this message.`,
  };
}
