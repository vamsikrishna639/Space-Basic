import { Types } from 'mongoose';
import { ACCESS_TOKEN_TTL_SECONDS, OTP_RESEND_SECONDS, type AuthResult, type OtpChannel } from '@spacebasic/shared';
import { errors } from '../../core/http/errors';
import { hit, peek, reset } from '../../core/db/counters';
import { audit } from '../../core/audit/audit';
import { hashPassword, verifyPassword } from '../../core/security/password';
import { generateOtp, hashOtp, otpMatches, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../../core/security/otp';
import { newRefreshToken, sha256, signAccessToken } from '../../core/security/tokens';
import { deliveryFor } from '../../providers/otp';
import { UserModel, type User } from '../users/user.model';
import { buildMe } from '../users/me.service';
import { recordConsentAtSignIn } from '../consent/consent.service';
import { OtpCodeModel, SessionModel, type OtpPurpose, type RevokeReason, type Session } from './auth.models';

export const REFRESH_SLIDING_MS = 30 * 24 * 3600 * 1000; // 30 days, extended on each use
export const REFRESH_ABSOLUTE_MS = 90 * 24 * 3600 * 1000; // hard limit
export const REFRESH_RACE_GRACE_MS = 15_000; // two tabs refreshing at once is not token theft
const LOGIN_FAIL_WINDOW_MS = 15 * 60_000;
const LOGIN_FAIL_LIMIT = 10;
const OTP_HOURLY_LIMIT = 5;

export interface RequestMeta { ip?: string; userAgent?: string; requestId?: string }
export interface IssuedSession { result: AuthResult; refreshToken: string; expiresAt: Date }

// ---------------------------------------------------------------------------------------------------------
// lookups (documented global exception to tenant scoping: sign-in has no institution picker)

function findLoginCandidate(field: 'email' | 'phone', value: string) {
  return UserModel.findOne({ [field]: value }).select('+passwordHash').setOptions({ unscoped: 'auth: sign-in lookup by email/phone' });
}

// ---------------------------------------------------------------------------------------------------------
// sessions

async function issueSession(user: Pick<User, '_id' | 'institutionId' | 'roles'>, meta: RequestMeta): Promise<IssuedSession> {
  const now = new Date();
  const refreshToken = newRefreshToken();
  const session = await SessionModel.create({
    institutionId: user.institutionId,
    userId: user._id,
    currentHash: sha256(refreshToken),
    previousHashes: [],
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_SLIDING_MS),
    absoluteExpiresAt: new Date(now.getTime() + REFRESH_ABSOLUTE_MS),
    revokedAt: null,
    revokedReason: null,
    userAgent: meta.userAgent?.slice(0, 300),
  });
  await UserModel.updateOne({ _id: user._id, institutionId: user.institutionId }, { $set: { lastLoginAt: now } });
  return { result: await authResult(user, session._id), refreshToken, expiresAt: session.expiresAt };
}

async function authResult(user: Pick<User, '_id' | 'institutionId' | 'roles'>, sessionId: Types.ObjectId): Promise<AuthResult> {
  const accessToken = signAccessToken({ sub: String(user._id), inst: String(user.institutionId), roles: user.roles, sid: String(sessionId) });
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, user: await buildMe(user.institutionId, user._id) };
}

export async function revokeAllSessions(
  who: { institutionId: Types.ObjectId; userId: Types.ObjectId },
  reason: RevokeReason,
  exceptSessionId?: Types.ObjectId,
): Promise<number> {
  const filter: Record<string, unknown> = { institutionId: who.institutionId, userId: who.userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const r = await SessionModel.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
  return r.modifiedCount;
}

// ---------------------------------------------------------------------------------------------------------
// password sign-in

export async function loginWithPassword(email: string, password: string, meta: RequestMeta): Promise<IssuedSession> {
  const failKey = `login:fail:${email}`;
  const fails = await peek(failKey);
  if (fails.count >= LOGIN_FAIL_LIMIT) throw errors.rateLimited(fails.retryAfterSeconds);

  const user = await findLoginCandidate('email', email).lean();
  const ok = await verifyPassword(password, user?.status === 'active' ? user.passwordHash : null);
  if (!user || user.status !== 'active' || !ok) {
    await hit(failKey, LOGIN_FAIL_WINDOW_MS);
    throw errors.invalidCredentials();
  }
  await reset(failKey);
  await recordConsentAtSignIn({ institutionId: user.institutionId, userId: user._id }, meta);
  return issueSession(user, meta);
}

// ---------------------------------------------------------------------------------------------------------
// one-time codes

function lookupField(channel: OtpChannel): 'email' | 'phone' {
  return channel === 'email' ? 'email' : 'phone';
}

/**
 * Create (and deliver) a code. Always behaves the same whether or not the account exists: unknown
 * identifiers get a decoy record that can never be verified, and delivery happens after the response.
 */
export async function requestOtp(channel: OtpChannel, identifier: string, purpose: OtpPurpose): Promise<{ resendAfter: number; deliver: () => Promise<void> }> {
  const delivery = deliveryFor(channel);
  if (!delivery) throw errors.otpUnavailable();

  const cooldown = await hit(`otp:cool:${purpose}:${identifier}`, OTP_RESEND_SECONDS * 1000);
  if (cooldown.count > 1) throw errors.rateLimited(cooldown.retryAfterSeconds);
  const hourly = await hit(`otp:hour:${purpose}:${identifier}`, 3600_000);
  if (hourly.count > OTP_HOURLY_LIMIT) throw errors.rateLimited(hourly.retryAfterSeconds);

  const user = await findLoginCandidate(lookupField(channel), identifier).lean();
  const real = !!user && user.status === 'active';
  const code = generateOtp();
  await OtpCodeModel.create({
    purpose, channel, identifier,
    userId: real ? user!._id : null,
    codeHash: hashOtp(real ? code : generateOtp() + 'x', identifier, purpose), // decoy can never match
    attempts: 0,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    consumedAt: null,
  });
  const deliver = async () => {
    if (!real) return;
    await delivery.send({ channel, to: identifier, code, purpose, expiresInMinutes: OTP_TTL_MS / 60_000 });
  };
  return { resendAfter: OTP_RESEND_SECONDS, deliver };
}

/** Check a code; on success mark it consumed and return the user id. Wrong / expired / locked -> 401. */
async function consumeOtp(identifier: string, purpose: OtpPurpose, code: string): Promise<Types.ObjectId> {
  const now = new Date();
  const otp = await OtpCodeModel.findOne({ identifier, purpose, consumedAt: null, expiresAt: { $gt: now } })
    .sort({ createdAt: -1 })
    .select('+codeHash');
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw errors.invalidCredentials();
  if (!otpMatches(code, identifier, purpose, otp.codeHash) || !otp.userId) {
    await OtpCodeModel.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    throw errors.invalidCredentials();
  }
  // consume atomically (a code works once even under concurrent requests)
  const r = await OtpCodeModel.updateOne({ _id: otp._id, consumedAt: null }, { $set: { consumedAt: now } });
  if (r.modifiedCount !== 1) throw errors.invalidCredentials();
  return otp.userId;
}

export async function loginWithOtp(channel: OtpChannel, identifier: string, code: string, meta: RequestMeta): Promise<IssuedSession> {
  if (!deliveryFor(channel)) throw errors.otpUnavailable();
  const userId = await consumeOtp(identifier, 'login', code);
  const user = await UserModel.findOne({ _id: userId, [lookupField(channel)]: identifier, status: 'active' })
    .setOptions({ unscoped: 'auth: user from a verified one-time code' })
    .lean();
  if (!user) throw errors.invalidCredentials();
  await recordConsentAtSignIn({ institutionId: user.institutionId, userId: user._id }, meta);
  return issueSession(user, meta);
}

// ---------------------------------------------------------------------------------------------------------
// refresh / logout

export type RefreshOutcome =
  | { kind: 'ok'; issued: IssuedSession }
  | { kind: 'race' }
  | { kind: 'invalid' }
  | { kind: 'reuse'; session: Session };

export async function refresh(refreshToken: string, meta: RequestMeta): Promise<RefreshOutcome> {
  const hash = sha256(refreshToken);
  const now = new Date();
  const session = await SessionModel.findOne({ currentHash: hash })
    .select('+currentHash +previousHashes')
    .setOptions({ unscoped: 'auth: refresh token lookup by hash' });

  if (!session) {
    const reused = await SessionModel.findOne({ previousHashes: hash })
      .select('+previousHashes')
      .setOptions({ unscoped: 'auth: refresh token reuse detection' });
    if (!reused) return { kind: 'invalid' };
    if (reused.revokedAt) return { kind: 'invalid' };
    const last = reused.previousHashes[reused.previousHashes.length - 1];
    if (last === hash && reused.rotatedAt && now.getTime() - reused.rotatedAt.getTime() < REFRESH_RACE_GRACE_MS) {
      return { kind: 'race' }; // another tab rotated this token a moment ago: not theft
    }
    await SessionModel.updateOne({ _id: reused._id, institutionId: reused.institutionId }, { $set: { revokedAt: now, revokedReason: 'reuse_detected' } });
    await audit({ institutionId: reused.institutionId, actorId: reused.userId, action: 'session.reuse_detected', targetType: 'session', targetId: reused._id, requestId: meta.requestId });
    return { kind: 'reuse', session: reused.toObject() };
  }

  if (session.revokedAt || session.expiresAt <= now || session.absoluteExpiresAt <= now) return { kind: 'invalid' };
  const user = await UserModel.findOne({ _id: session.userId, institutionId: session.institutionId, status: 'active' }).lean();
  if (!user) {
    await SessionModel.updateOne({ _id: session._id, institutionId: session.institutionId }, { $set: { revokedAt: now, revokedReason: 'disabled' } });
    return { kind: 'invalid' };
  }

  // rotate atomically: only one request can rotate a given token
  const next = newRefreshToken();
  const expiresAt = new Date(Math.min(now.getTime() + REFRESH_SLIDING_MS, session.absoluteExpiresAt.getTime()));
  const rotated = await SessionModel.updateOne(
    { _id: session._id, institutionId: session.institutionId, currentHash: hash, revokedAt: null },
    { $set: { currentHash: sha256(next), rotatedAt: now, lastUsedAt: now, expiresAt }, $push: { previousHashes: { $each: [hash], $slice: -20 } } },
  );
  if (rotated.modifiedCount !== 1) return { kind: 'race' };
  return { kind: 'ok', issued: { result: await authResult(user, session._id), refreshToken: next, expiresAt } };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await SessionModel.updateOne({ currentHash: sha256(refreshToken), revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'logout' } })
    .setOptions({ unscoped: 'auth: logout by refresh token hash' });
}

// ---------------------------------------------------------------------------------------------------------
// passwords

export async function resetPassword(email: string, code: string, newPassword: string, meta: RequestMeta): Promise<void> {
  const userId = await consumeOtp(email, 'reset_password', code);
  const user = await UserModel.findOne({ _id: userId, email, status: 'active' }).setOptions({ unscoped: 'auth: password reset by verified code' }).lean();
  if (!user) throw errors.invalidCredentials();
  await UserModel.updateOne({ _id: user._id, institutionId: user.institutionId }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
  await revokeAllSessions({ institutionId: user.institutionId, userId: user._id }, 'password_reset');
  await reset(`login:fail:${email}`);
  await audit({ institutionId: user.institutionId, actorId: user._id, action: 'password.reset', targetType: 'user', targetId: user._id, requestId: meta.requestId });
}

export async function changePassword(
  ctx: { institutionId: Types.ObjectId; userId: Types.ObjectId; sessionId: Types.ObjectId },
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await UserModel.findOne({ _id: ctx.userId, institutionId: ctx.institutionId }).select('+passwordHash').lean();
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw errors.invalidCredentials();
  await UserModel.updateOne({ _id: user._id, institutionId: ctx.institutionId }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
  await revokeAllSessions(ctx, 'password_changed', ctx.sessionId);
  await audit({ institutionId: ctx.institutionId, actorId: ctx.userId, action: 'password.change', targetType: 'user', targetId: ctx.userId, requestId: meta.requestId });
}
