// Phone numbers are stored in E.164. The sign-in screen takes an Indian 10-digit number shown as "98765 43210".

const E164 = /^\+[1-9]\d{7,14}$/;
const INDIA_MOBILE = /^[6-9]\d{9}$/;

/** Normalise user input to E.164, or return null when it isn't a valid number. */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  const digits = raw.replace(/[\s\-()]/g, '');
  if (E164.test(digits)) return digits;
  if (INDIA_MOBILE.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

/** "9876543210" -> "98765 43210" (display format used on the sign-in screen). */
export function formatIndianMobile(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}
