import { parseEnv, ConfigError } from './env';

const S = 'x'.repeat(40);
const prodBase = {
  NODE_ENV: 'production', MONGODB_URI: 'mongodb+srv://u:p@cluster.example/db', JWT_ACCESS_SECRET: S, QR_TOKEN_SECRET: S, OTP_PEPPER: S,
  APP_ORIGINS: 'https://spacebasic.example', COOKIE_SECURE: 'true',
};

describe('environment rules', () => {
  it('production without any OTP provider is valid (email + password still works)', () => {
    const env = parseEnv({ ...prodBase });
    expect(env.OTP_PROVIDER).toBeUndefined();
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('refuses console OTP in production unless ALLOW_CONSOLE_OTP=true (then warns loudly)', () => {
    expect(() => parseEnv({ ...prodBase, OTP_PROVIDER: 'console' })).toThrow(ConfigError);
    const env = parseEnv({ ...prodBase, OTP_PROVIDER: 'console', ALLOW_CONSOLE_OTP: 'true' });
    expect(env.warnings.join(' ')).toMatch(/FAKE users only/);
  });

  it('refuses gmail-smtp in production', () => {
    expect(() => parseEnv({ ...prodBase, OTP_PROVIDER: 'gmail-smtp', GMAIL_USER: 'a', GMAIL_APP_PASSWORD: 'b' })).toThrow(/local development only/);
  });

  it('RELAX_RATE_LIMITS is refused in production, and allowed (with a warning) in development and tests', () => {
    expect(() => parseEnv({ ...prodBase, RELAX_RATE_LIMITS: 'true' })).toThrow(/RELAX_RATE_LIMITS is for development and tests only/);
    expect(() => parseEnv({ ...prodBase, RELAX_RATE_LIMITS: '1' })).toThrow(ConfigError);
    expect(parseEnv({ ...prodBase }).RELAX_RATE_LIMITS).toBe(false);
    for (const NODE_ENV of ['development', 'test']) {
      const env = parseEnv({ NODE_ENV, RELAX_RATE_LIMITS: 'true' });
      expect(env.RELAX_RATE_LIMITS).toBe(true);
      expect(env.warnings.join(' ')).toMatch(/rate limits are raised/);
    }
    expect(parseEnv({ NODE_ENV: 'development' }).RELAX_RATE_LIMITS).toBe(false); // off unless asked for
  });

  it('gmail-api needs all its variables', () => {
    expect(() => parseEnv({ ...prodBase, OTP_PROVIDER: 'gmail-api' })).toThrow(/GMAIL_API_CLIENT_ID/);
  });

  it('production requires strong secrets, a DB URI, https origins and secure cookies', () => {
    expect(() => parseEnv({ ...prodBase, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => parseEnv({ ...prodBase, MONGODB_URI: '' })).toThrow(/MONGODB_URI/);
    expect(() => parseEnv({ ...prodBase, APP_ORIGINS: 'http://insecure.example' })).toThrow(/https/);
    expect(() => parseEnv({ ...prodBase, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  it('development generates throwaway secrets when none are set', () => {
    const env = parseEnv({ NODE_ENV: 'development' });
    expect(env.generatedSecrets).toEqual(['JWT_ACCESS_SECRET', 'QR_TOKEN_SECRET', 'OTP_PEPPER']);
    expect(env.JWT_ACCESS_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('development defaults OTP to the console only when OTP_PROVIDER is absent', () => {
    expect(parseEnv({ NODE_ENV: 'development' }).OTP_PROVIDER).toBe('console');
    expect(parseEnv({ NODE_ENV: 'development', OTP_PROVIDER: '' }).OTP_PROVIDER).toBeUndefined();
    expect(parseEnv({ ...prodBase }).OTP_PROVIDER).toBeUndefined();
  });
});
