import { env } from '../../config/env';
import { otpText, type OtpDelivery } from './message';

/**
 * Production email: Gmail API over HTTPS (works on Render's free tier, where SMTP is blocked).
 * OAuth2: exchange the stored refresh token for an access token, then users.messages.send.
 * Plain fetch, no SDK. Gmail's sending limit for a normal account is about 500 messages/day (README).
 */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_API_CLIENT_ID ?? '',
      client_secret: env.GMAIL_API_CLIENT_SECRET ?? '',
      refresh_token: env.GMAIL_API_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`gmail-api: token exchange failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

function rfc822(from: string, to: string, subject: string, text: string): string {
  const encSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  return [`From: ${from}`, `To: ${to}`, `Subject: ${encSubject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', text].join('\r\n');
}

export const gmailApiDelivery: OtpDelivery = {
  name: 'gmail-api',
  async send(m) {
    if (m.channel !== 'email') throw new Error('gmail-api only sends email');
    const { subject, text } = otpText(m);
    const raw = Buffer.from(rfc822(env.GMAIL_API_SENDER ?? '', m.to, subject, text), 'utf8').toString('base64url');
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) throw new Error(`gmail-api: send failed (${res.status})`);
  },
};
