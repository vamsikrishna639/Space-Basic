import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import {
  WRONG_CODE_MESSAGE, cooldownFrom, describeTarget, errorMessage, formatCountdown, parseCodeSent, prefillFor, prefillOf,
  sanitizeCode, secondsLeft, validateTarget,
} from './codeFlow';

describe('code entry', () => {
  it('keeps digits only, at most four', () => {
    expect(sanitizeCode('12a3 4 5')).toBe('1234');
    expect(sanitizeCode('Your code is 0042')).toBe('0042');
    expect(sanitizeCode('')).toBe('');
  });
});

describe('resend countdown', () => {
  it('counts whole seconds down to zero, never below', () => {
    const sent = 1_000_000;
    expect(secondsLeft(sent, 30, sent)).toBe(30);
    expect(secondsLeft(sent, 30, sent + 100)).toBe(30);
    expect(secondsLeft(sent, 30, sent + 29_001)).toBe(1);
    expect(secondsLeft(sent, 30, sent + 30_000)).toBe(0);
    expect(secondsLeft(sent, 30, sent + 99_000)).toBe(0);
  });
  it('formats as m:ss', () => {
    expect(formatCountdown(30)).toBe('0:30');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(75)).toBe('1:15');
  });
});

describe('router state', () => {
  it('accepts a complete code-sent state only', () => {
    const ok = { channel: 'sms', identifier: '+919000000001', sentAt: 1, resendAfter: 30 };
    expect(parseCodeSent(ok)).toEqual(ok);
    expect(parseCodeSent({ ...ok, channel: 'fax' })).toBeNull();
    expect(parseCodeSent({ ...ok, identifier: '' })).toBeNull();
    expect(parseCodeSent({ channel: 'email', identifier: 'a@b.co' })).toBeNull();
    expect(parseCodeSent(null)).toBeNull();
  });
  it('reads a prefill value', () => {
    expect(prefillOf({ prefill: 'arjun.rao@example.com' })).toBe('arjun.rao@example.com');
    expect(prefillOf({ prefill: 3 })).toBe('');
    expect(prefillOf(undefined)).toBe('');
  });
  it('turns the identifier back into what was typed', () => {
    expect(prefillFor('email', 'arjun.rao@example.com')).toBe('arjun.rao@example.com');
    expect(prefillFor('sms', '+919000000001')).toBe('90000 00001');
    expect(prefillFor('whatsapp', '+447700900123')).toBe('+447700900123');
  });
});

describe('targets', () => {
  it('describes where the code went', () => {
    expect(describeTarget('email', 'arjun.rao@example.com')).toBe('arjun.rao@example.com');
    expect(describeTarget('sms', '+919876543210')).toBe('+91 98765 43210');
    expect(describeTarget('whatsapp', '+919876543210')).toBe('+91 98765 43210 on WhatsApp');
  });
  it('normalises and validates before asking for a code', () => {
    expect(validateTarget('email', '  Arjun.Rao@Example.com ')).toEqual({ identifier: 'arjun.rao@example.com' });
    expect(validateTarget('email', 'arjun')).toEqual({ error: 'Enter a valid email address' });
    expect(validateTarget('sms', '98765 43210')).toEqual({ identifier: '+919876543210' });
    expect(validateTarget('whatsapp', '12345')).toEqual({ error: 'Enter a valid 10-digit mobile number' });
    expect(validateTarget('sms', '')).toEqual({ error: 'Enter your mobile number' });
  });
});

describe('errors', () => {
  it('treats a 429 inside the resend cooldown as "already sent"', () => {
    expect(cooldownFrom(new ApiError(429, 'RATE_LIMITED', 'x', undefined, 12))).toBe(12);
    expect(cooldownFrom(new ApiError(429, 'RATE_LIMITED', 'x', undefined, 1800))).toBeNull(); // hourly limit
    expect(cooldownFrom(new ApiError(429, 'RATE_LIMITED', 'x'))).toBeNull();
    expect(cooldownFrom(new ApiError(503, 'OTP_UNAVAILABLE', 'x', undefined, 5))).toBeNull();
  });
  it('gives a code-specific message for a wrong or expired code', () => {
    expect(errorMessage(new ApiError(401, 'INVALID_CREDENTIALS', "We couldn't sign you in with those details."))).toBe(WRONG_CODE_MESSAGE);
    expect(errorMessage(new ApiError(400, 'VALIDATION_ERROR', 'Please check', { newPassword: 'Use at least 8 characters' }), 'newPassword'))
      .toBe('Use at least 8 characters');
    expect(errorMessage(new ApiError(503, 'OTP_UNAVAILABLE', 'One-time codes are not available right now.'))).toBe('One-time codes are not available right now.');
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
  it('names the wait when a limit lasts longer than a moment', () => {
    const limited = (s?: number) => new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.', undefined, s);
    expect(errorMessage(limited(3000))).toBe('Too many attempts. Please try again in 50 minutes.');
    expect(errorMessage(limited(91))).toBe('Too many attempts. Please try again in 2 minutes.');
    expect(errorMessage(limited(20))).toBe('Too many attempts. Please wait a moment and try again.');
    expect(errorMessage(limited())).toBe('Too many attempts. Please wait a moment and try again.');
  });
});
