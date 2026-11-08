import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_TTL_SECONDS, ROLES, type Role } from '@spacebasic/shared';
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
// Entry Pass QR tokens (docs/architecture.md §9): short-lived, single-use (jti), no personal data. A separate
// secret and audience, so an access token can never pass as a QR token or the other way round.

const QR_AUDIENCE = 'spacebasic-qr';
export const QR_TOKEN_TTL_SECONDS = 15;
const QR_CLOCK_TOLERANCE_SECONDS = 5;

export interface QrClaims { sub: string; inst: string; jti: string; exp: number }

export function signQrToken(c: { sub: string; inst: string }): { token: string; jti: string; expiresAt: Date } {
  const jti = crypto.randomBytes(16).toString('base64url');
  const token = jwt.sign({ inst: c.inst }, env.QR_TOKEN_SECRET, {
    algorithm: 'HS256', subject: c.sub, jwtid: jti, expiresIn: QR_TOKEN_TTL_SECONDS, issuer: ISSUER, audience: QR_AUDIENCE,
  });
  const { exp } = jwt.decode(token) as jwt.JwtPayload;
  return { token, jti, expiresAt: new Date(exp! * 1000) };
}

/** 'expired' and 'invalid' get different messages on the scanner, so the warden knows to ask for a fresh code. */
export function verifyQrToken(token: string): QrClaims | 'expired' | 'invalid' {
  try {
    const p = jwt.verify(token, env.QR_TOKEN_SECRET, {
      algorithms: ['HS256'], issuer: ISSUER, audience: QR_AUDIENCE, clockTolerance: QR_CLOCK_TOLERANCE_SECONDS,
    }) as jwt.JwtPayload;
    if (typeof p.sub !== 'string' || typeof p.inst !== 'string' || typeof p.jti !== 'string' || typeof p.exp !== 'number') return 'invalid';
    // Never accept a token that claims a longer life than we issue.
    if (typeof p.iat !== 'number' || p.exp - p.iat > QR_TOKEN_TTL_SECONDS) return 'invalid';
    return { sub: p.sub, inst: p.inst, jti: p.jti, exp: p.exp };
  } catch (err) {
    return err instanceof jwt.TokenExpiredError ? 'expired' : 'invalid';
  }
}

/** Opaque 256-bit refresh token; only its SHA-256 hash is stored. */
export function newRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
