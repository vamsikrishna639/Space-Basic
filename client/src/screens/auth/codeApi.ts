import { CONSENT_POLICY_VERSION, type OtpChannel, type OtpRequestResult } from '@spacebasic/shared';
import { api } from '../../api/client';
import { cooldownFrom, type CodeSent } from './codeFlow';

/**
 * Ask for a one-time code: `login` (POST /auth/otp/request, needs the consent the user just ticked) or `reset`
 * (POST /auth/password/forgot, email only). The API answers the same whether or not the account exists.
 * Inside the resend cooldown it answers 429; a code was sent moments ago, so the code screen opens anyway.
 */
export async function sendCode(purpose: 'login' | 'reset', channel: OtpChannel, identifier: string): Promise<CodeSent> {
  try {
    const r = purpose === 'login'
      ? await api<OtpRequestResult>('POST', '/auth/otp/request', {
          auth: false,
          body: { channel, identifier, purpose: 'login', consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION } },
        })
      : await api<OtpRequestResult>('POST', '/auth/password/forgot', { auth: false, body: { email: identifier } });
    return { channel, identifier, sentAt: Date.now(), resendAfter: r.resendAfter };
  } catch (err) {
    const wait = cooldownFrom(err);
    if (wait !== null) return { channel, identifier, sentAt: Date.now(), resendAfter: wait };
    throw err;
  }
}

/** POST /auth/password/reset: sets the new password and signs the account out everywhere. */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await api<void>('POST', '/auth/password/reset', { auth: false, body: { email, code, newPassword } });
}
