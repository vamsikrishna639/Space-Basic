// Environment: parsed and validated once at startup (fail fast). Development and production rules differ.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';

const boolish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

/** Headers a proxy in front of the API sets itself, carrying the visitor's address (core/middleware/clientIp.ts). */
export const CLIENT_IP_HEADERS = ['x-real-ip', 'x-vercel-forwarded-for'] as const;
export type ClientIpHeader = (typeof CLIENT_IP_HEADERS)[number];

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: optionalString,
  DEV_DB_PORT: z.coerce.number().int().default(27027),
  JWT_ACCESS_SECRET: optionalString,
  QR_TOKEN_SECRET: optionalString,
  OTP_PEPPER: optionalString,
  APP_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: optionalString,
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  CLIENT_IP_HEADER: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : undefined))
    .pipe(z.enum(CLIENT_IP_HEADERS).optional()),
  OTP_PROVIDER: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined))
    .pipe(z.enum(['console', 'gmail-api', 'gmail-smtp']).optional()),
  ALLOW_CONSOLE_OTP: boolish,
  GMAIL_USER: optionalString,
  GMAIL_APP_PASSWORD: optionalString,
  GMAIL_API_CLIENT_ID: optionalString,
  GMAIL_API_CLIENT_SECRET: optionalString,
  GMAIL_API_REFRESH_TOKEN: optionalString,
  GMAIL_API_SENDER: optionalString,
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  RELAX_RATE_LIMITS: boolish,
});

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  isProd: boolean;
  PORT: number;
  MONGODB_URI: string | undefined;
  DEV_DB_PORT: number;
  JWT_ACCESS_SECRET: string;
  QR_TOKEN_SECRET: string;
  OTP_PEPPER: string;
  APP_ORIGINS: string[];
  COOKIE_SECURE: boolean;
  TRUST_PROXY: number;
  /** A header the proxy sets itself with the visitor's address; when present and valid it is the caller's address. */
  CLIENT_IP_HEADER: ClientIpHeader | undefined;
  OTP_PROVIDER: 'console' | 'gmail-api' | 'gmail-smtp' | undefined;
  ALLOW_CONSOLE_OTP: boolean;
  GMAIL_USER?: string;
  GMAIL_APP_PASSWORD?: string;
  GMAIL_API_CLIENT_ID?: string;
  GMAIL_API_CLIENT_SECRET?: string;
  GMAIL_API_REFRESH_TOKEN?: string;
  GMAIL_API_SENDER?: string;
  BCRYPT_COST: number;
  /** Development and tests only: raise the sign-in and code rate limits (core/middleware/rateLimit.ts). */
  RELAX_RATE_LIMITS: boolean;
  /** Secrets that were generated for this process because none were configured (development/test only). */
  generatedSecrets: string[];
  warnings: string[];
}

export class ConfigError extends Error {}

/** Pure: raw env -> validated Env. Throws ConfigError with every problem listed. */
export function parseEnv(raw: NodeJS.ProcessEnv, devSecretStore?: (name: string) => string): Env {
  const r = rawSchema.safeParse(raw);
  if (!r.success) {
    throw new ConfigError('Invalid environment:\n' + r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  }
  const v = r.data;
  const isProd = v.NODE_ENV === 'production';
  const problems: string[] = [];
  const warnings: string[] = [];
  const generatedSecrets: string[] = [];

  const secret = (name: 'JWT_ACCESS_SECRET' | 'QR_TOKEN_SECRET' | 'OTP_PEPPER'): string => {
    const value = v[name];
    if (value && value.length >= 32) return value;
    if (isProd) { problems.push(`${name} must be set to at least 32 random characters in production`); return ''; }
    if (value) warnings.push(`${name} is shorter than 32 characters (fine for development only)`);
    if (value) return value;
    generatedSecrets.push(name);
    return devSecretStore ? devSecretStore(name) : crypto.randomBytes(32).toString('base64url');
  };

  if (isProd && !v.MONGODB_URI) problems.push('MONGODB_URI is required in production');

  // OTP provider rules (decisions.md): console refused in production unless ALLOW_CONSOLE_OTP; gmail-smtp is local-only.
  if (isProd && v.OTP_PROVIDER === 'console' && !v.ALLOW_CONSOLE_OTP) {
    problems.push('OTP_PROVIDER=console is refused in production. Use gmail-api, leave it empty (password sign-in only), or set ALLOW_CONSOLE_OTP=true for a demo with FAKE users only');
  }
  if (isProd && v.OTP_PROVIDER === 'gmail-smtp') {
    problems.push('OTP_PROVIDER=gmail-smtp is for local development only (SMTP is blocked on Render free tier); use gmail-api in production');
  }
  if (v.OTP_PROVIDER === 'gmail-api') {
    for (const k of ['GMAIL_API_CLIENT_ID', 'GMAIL_API_CLIENT_SECRET', 'GMAIL_API_REFRESH_TOKEN', 'GMAIL_API_SENDER'] as const) {
      if (!v[k]) problems.push(`${k} is required when OTP_PROVIDER=gmail-api`);
    }
  }
  if (v.OTP_PROVIDER === 'gmail-smtp') {
    for (const k of ['GMAIL_USER', 'GMAIL_APP_PASSWORD'] as const) if (!v[k]) problems.push(`${k} is required when OTP_PROVIDER=gmail-smtp`);
  }
  if (isProd && v.ALLOW_CONSOLE_OTP) {
    warnings.push('ALLOW_CONSOLE_OTP=true in PRODUCTION: one-time codes are printed to the server log. Demo deployments with FAKE users only!');
  }

  // Relaxed sign-in and code limits exist for repeated local smoke runs. Production limits never change.
  if (isProd && v.RELAX_RATE_LIMITS) problems.push('RELAX_RATE_LIMITS is for development and tests only and is refused when NODE_ENV=production');
  else if (v.RELAX_RATE_LIMITS) warnings.push('RELAX_RATE_LIMITS=true: sign-in and code rate limits are raised (development/test only)');

  const origins = v.APP_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (isProd && origins.some((o) => !o.startsWith('https://'))) problems.push('APP_ORIGINS must be https:// origins in production');

  const env: Env = {
    NODE_ENV: v.NODE_ENV,
    isProd,
    PORT: v.PORT,
    MONGODB_URI: v.MONGODB_URI,
    DEV_DB_PORT: v.DEV_DB_PORT,
    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    QR_TOKEN_SECRET: secret('QR_TOKEN_SECRET'),
    OTP_PEPPER: secret('OTP_PEPPER'),
    APP_ORIGINS: origins,
    COOKIE_SECURE: v.COOKIE_SECURE === undefined ? isProd : v.COOKIE_SECURE === 'true' || v.COOKIE_SECURE === '1',
    TRUST_PROXY: v.TRUST_PROXY,
    CLIENT_IP_HEADER: v.CLIENT_IP_HEADER,
    // Development with no OTP_PROVIDER variable at all (fresh clone, no .env): print codes to the console.
    // An explicit empty value still means "password sign-in only". Production never gets a default.
    OTP_PROVIDER: v.OTP_PROVIDER ?? (v.NODE_ENV === 'development' && raw.OTP_PROVIDER === undefined ? 'console' : undefined),
    ALLOW_CONSOLE_OTP: v.ALLOW_CONSOLE_OTP,
    GMAIL_USER: v.GMAIL_USER,
    GMAIL_APP_PASSWORD: v.GMAIL_APP_PASSWORD,
    GMAIL_API_CLIENT_ID: v.GMAIL_API_CLIENT_ID,
    GMAIL_API_CLIENT_SECRET: v.GMAIL_API_CLIENT_SECRET,
    GMAIL_API_REFRESH_TOKEN: v.GMAIL_API_REFRESH_TOKEN,
    GMAIL_API_SENDER: v.GMAIL_API_SENDER,
    BCRYPT_COST: v.BCRYPT_COST,
    RELAX_RATE_LIMITS: v.RELAX_RATE_LIMITS,
    generatedSecrets,
    warnings,
  };
  if (isProd && !env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production');
  if (problems.length) throw new ConfigError('Invalid environment:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  return env;
}

// Development: load server/.env.development if present (Node's built-in loader; never in production).
if ((process.env.NODE_ENV ?? 'development') === 'development') {
  const file = path.resolve(__dirname, '../../.env.development');
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

/** Development only: throwaway secrets kept in server/.data/dev-secrets.json (gitignored) so tokens survive restarts. */
function fileSecretStore(): (name: string) => string {
  const file = path.resolve(__dirname, "../../.data/dev-secrets.json");
  let store: Record<string, string> = {};
  try { store = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>; } catch { /* first run */ }
  return (name) => {
    if (!store[name]) {
      store[name] = crypto.randomBytes(32).toString("base64url");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(store, null, 2));
    }
    return store[name]!;
  };
}

export const env: Env = parseEnv(process.env, (process.env.NODE_ENV ?? "development") === "development" ? fileSecretStore() : undefined);
