import { describe, expect, it } from 'vitest';
import { profilePhone } from './profileText';

describe('profile text', () => {
  it('shows an Indian number as its 10 digits, like the screenshot', () => {
    expect(profilePhone('+919876543210')).toBe('9876543210');
    expect(profilePhone('+447700900123')).toBe('+447700900123');
  });
});
