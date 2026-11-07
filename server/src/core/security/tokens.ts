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

/** Opaque 256-bit refresh token; only its SHA-256 hash is stored. */
export function newRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
