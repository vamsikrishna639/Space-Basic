import { limitsFor, PRODUCTION_LIMITS, signInLimits } from './rateLimit';

describe('sign-in and code rate limits', () => {
  it('production numbers are exactly the documented ones (docs/api.md "Rate limits")', () => {
    expect(PRODUCTION_LIMITS).toEqual({
      authStrict: { windowMs: 15 * 60_000, limit: 20 },
      otpSend: { windowMs: 60 * 60_000, limit: 30 },
      loginFailsPerEmail: 10,
      codesPerAddressHourly: 5,
    });
    expect(limitsFor(false)).toEqual(PRODUCTION_LIMITS);
  });

  it('this test process runs with the production limits (the flag is off by default)', () => {
    expect(signInLimits()).toEqual(PRODUCTION_LIMITS);
  });

  it('relaxed limits only raise the counts; every window stays the same', () => {
    const r = limitsFor(true);
    expect(r.authStrict.windowMs).toBe(PRODUCTION_LIMITS.authStrict.windowMs);
    expect(r.otpSend.windowMs).toBe(PRODUCTION_LIMITS.otpSend.windowMs);
    expect(r.authStrict.limit).toBeGreaterThan(PRODUCTION_LIMITS.authStrict.limit);
    expect(r.otpSend.limit).toBeGreaterThan(PRODUCTION_LIMITS.otpSend.limit);
    expect(r.loginFailsPerEmail).toBeGreaterThan(PRODUCTION_LIMITS.loginFailsPerEmail);
    expect(r.codesPerAddressHourly).toBeGreaterThan(PRODUCTION_LIMITS.codesPerAddressHourly);
  });

  it('asking for the limits never hands out the shared production object', () => {
    const a = limitsFor(false);
    a.authStrict.limit = 9999;
    expect(PRODUCTION_LIMITS.authStrict.limit).toBe(20);
  });
});
