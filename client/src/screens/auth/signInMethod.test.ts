import { describe, expect, it } from 'vitest';
import { formatIndianMobile } from '@spacebasic/shared';
import { canSubmit, parseSignInMethod } from './signInMethod';

describe('sign-in tab from the URL', () => {
  it('accepts only email and mobile', () => {
    expect(parseSignInMethod('email')).toBe('email');
    expect(parseSignInMethod('mobile')).toBe('mobile');
    expect(parseSignInMethod('Email')).toBeNull();
    expect(parseSignInMethod(undefined)).toBeNull();
  });
});

describe('consent gate', () => {
  it('keeps submit disabled until consent is ticked', () => {
    expect(canSubmit(false)).toBe(false);
    expect(canSubmit(true)).toBe(true);
  });
});

describe('mobile number field', () => {
  it('formats as 5 + 5 digits like the placeholder "98765 43210"', () => {
    expect(formatIndianMobile('9876543210')).toBe('98765 43210');
    expect(formatIndianMobile('98765')).toBe('98765');
    expect(formatIndianMobile('98765 432109999')).toBe('98765 43210');
    expect(formatIndianMobile('98a76')).toBe('9876');
  });
});
