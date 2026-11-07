import { _clean } from './sanitize';
import { normalizePhone } from '@spacebasic/shared';

describe('sanitize', () => {
  it('drops $-operators and dotted keys at any depth', () => {
    expect(_clean({ email: { $ne: null }, a: { 'b.c': 1, d: [{ $gt: 1, ok: 2 }] }, keep: 'x' })).toEqual({ email: {}, a: { d: [{ ok: 2 }] }, keep: 'x' });
  });
});

describe('shared: normalizePhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['9876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+919876543210', '+919876543210'],
    ['+14155552671', '+14155552671'],
  ])('%s -> %s', (input, out) => expect(normalizePhone(input)).toBe(out));
  it.each(['12345', '5876543210', 'abc', ''])('rejects %s', (input) => expect(normalizePhone(input)).toBeNull());
});
