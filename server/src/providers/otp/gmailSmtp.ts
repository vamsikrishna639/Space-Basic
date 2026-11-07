import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { otpText, type OtpDelivery } from './message';

/**
 * LOCAL DEVELOPMENT ONLY: Gmail over SMTP with an App Password (GMAIL_USER, GMAIL_APP_PASSWORD).
 * Refused in production by config validation (SMTP ports are blocked on Render's free tier).
 */
let transport: Transporter | null = null;

export const gmailSmtpDelivery: OtpDelivery = {
  name: 'gmail-smtp',
  async send(m) {
    if (m.channel !== 'email') throw new Error('gmail-smtp only sends email');
    transport ??= nodemailer.createTransport({ service: 'gmail', auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } });
    const { subject, text } = otpText(m);
    await transport.sendMail({ from: env.GMAIL_USER, to: m.to, subject, text });
  },
};
