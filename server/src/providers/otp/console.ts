import type { OtpDelivery, OtpMessage } from './message';

/** Codes sent while NODE_ENV=test (tests read them here instead of the console). */
export const testOutbox: OtpMessage[] = [];

/** Development / demo provider: prints the code in the server console. Never used for real users in production. */
export const consoleDelivery: OtpDelivery = {
  name: 'console',
  async send(m) {
    if (process.env.NODE_ENV === 'test') { testOutbox.push(m); return; }
    const line = `OTP  ${m.channel.toUpperCase()}  ${m.to}  ->  ${m.code}   (${m.purpose}, expires in ${m.expiresInMinutes} min)`;
    console.log(`\n\x1b[33m+${'-'.repeat(line.length + 2)}+\n| ${line} |\n+${'-'.repeat(line.length + 2)}+\x1b[0m\n`);
  },
};
