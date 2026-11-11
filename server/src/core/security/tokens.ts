import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_TTL_SECONDS, QR_TOKEN_LENGTH, QR_TOKEN_SHAPE, QR_TOKEN_TTL_SECONDS, ROLES, type Role } from '@spacebasic/shared';
import { env } from '../../config/env';
import { errors } from '../http/errors';

const ISSUER = 'spacebasic';
const AUDIENCE = 'spacebasic-api';

export interface AccessClaims { sub: string; inst: string; roles: Role[]; sid: string }

export function signAccessToken(c: AccessClaims): string {
  return jwt.sign({ inst: c.inst, roles: c.roles, sid: c.sid }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256', subject: c.sub, expiresIn: ACCESS_TOKEN_TTL_SECONDS, issuer: ISSUER, audience: AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE }) as jwt.JwtPayload;
    const roles = Array.isArray(p.roles) ? (p.roles.filter((r) => (ROLES as readonly string[]).includes(r)) as Role[]) : [];
    if (typeof p.sub !== 'string' || typeof p.inst !== 'string' || typeof p.sid !== 'string' || !roles.length) throw errors.unauthenticated();
    return { sub: p.sub, inst: p.inst, roles, sid: p.sid };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw errors.tokenExpired();
    throw errors.unauthenticated();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Entry Pass QR tokens (docs/architecture.md §9, docs/decisions.md 2026-11-08 "Compact QR token"): short-lived,
// single-use (jti), no personal data, signed with their own secret.
//
// Not a JWT: the Entry Pass screenshot's QR is version 6 at error-correction level M (41 x 41 modules), which holds
// 85-106 bytes. A JWT with these claims is ~290 characters (version 13, 69 x 69 modules), so it could never look
// like the screenshot. This token is always exactly 96 characters, so it always encodes as version 6-M:
//
//   base64url(body, 39 bytes) "." base64url(HMAC-SHA256(QR_TOKEN_SECRET, context || body), 32 bytes)
//   body = format 0x01 | sub (ObjectId, 12) | inst (ObjectId, 12) | jti (random, 10) | iat (uint32 BE seconds, 4)
//
// The expiry is not carried: it is always iat + 15 s, so a token can't claim a longer life. The MAC context string
// keeps these MACs apart from anything else the secret might ever sign.

const QR_CLOCK_TOLERANCE_SECONDS = 5;
export { QR_TOKEN_LENGTH }; // defined in shared with the shape (the warden's scanner checks it too)
const QR_FORMAT = 0x01;
const QR_MAC_CONTEXT = Buffer.from('spacebasic-qr/v1\0', 'utf8');
const QR_SHAPE = QR_TOKEN_SHAPE;
const OBJECT_ID = /^[0-9a-f]{24}$/;

export interface QrClaims { sub: string; inst: string; jti: string; exp: number }

const qrMac = (body: Buffer, secret: string) => crypto.createHmac('sha256', secret).update(QR_MAC_CONTEXT).update(body).digest();

/** Packs and signs a QR token. Exported for tests (forging expired or wrongly signed tokens); use signQrToken. */
export function encodeQrToken(f: { sub: string; inst: string; jti: Buffer; iat: number }, secret = env.QR_TOKEN_SECRET): string {
  if (!OBJECT_ID.test(f.sub) || !OBJECT_ID.test(f.inst) || f.jti.length !== 10) throw new Error('encodeQrToken: bad fields');
  const body = Buffer.alloc(39);
  body.writeUInt8(QR_FORMAT, 0);
  Buffer.from(f.sub, 'hex').copy(body, 1);
  Buffer.from(f.inst, 'hex').copy(body, 13);
  f.jti.copy(body, 25);
  body.writeUInt32BE(f.iat, 35);
  return `${body.toString('base64url')}.${qrMac(body, secret).toString('base64url')}`;
}

export function signQrToken(c: { sub: string; inst: string }, now = Date.now()): { token: string; jti: string; expiresAt: Date } {
  const jti = crypto.randomBytes(10);
  const iat = Math.floor(now / 1000);
  return { token: encodeQrToken({ ...c, jti, iat }), jti: jti.toString('base64url'), expiresAt: new Date((iat + QR_TOKEN_TTL_SECONDS) * 1000) };
}

/** 'expired' and 'invalid' get different messages on the scanner, so the warden knows to ask for a fresh code. */
export function verifyQrToken(token: string, now = Date.now()): QrClaims | 'expired' | 'invalid' {
  const m = token.length === QR_TOKEN_LENGTH ? QR_SHAPE.exec(token) : null;
  if (!m) return 'invalid';
  const body = Buffer.from(m[1]!, 'base64url');
  if (body.length !== 39 || body[0] !== QR_FORMAT) return 'invalid';
  // Compare the canonical encoding, so a second spelling of the same MAC is not accepted either.
  const expected = Buffer.from(qrMac(body, env.QR_TOKEN_SECRET).toString('base64url'));
  const given = Buffer.from(m[2]!);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return 'invalid';
  const iat = body.readUInt32BE(35);
  const exp = iat + QR_TOKEN_TTL_SECONDS;
  const nowS = Math.floor(now / 1000);
  if (iat > nowS + QR_CLOCK_TOLERANCE_SECONDS) return 'invalid'; // issued in the future: not by us
  if (nowS > exp + QR_CLOCK_TOLERANCE_SECONDS) return 'expired';
  return {
    sub: body.subarray(1, 13).toString('hex'),
    inst: body.subarray(13, 25).toString('hex'),
    jti: body.subarray(25, 35).toString('base64url'),
    exp,
  };
}

/** Opaque 256-bit refresh token; only its SHA-256 hash is stored. */
export function newRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
