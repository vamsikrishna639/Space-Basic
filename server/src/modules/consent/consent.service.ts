import type { Types } from 'mongoose';
import { CONSENT_POLICY_VERSION, PRIVACY_POLICY_PATH, type ConsentPolicy, type MyConsent } from '@spacebasic/shared';
import { audit } from '../../core/audit/audit';
import { SessionModel } from '../auth/auth.models';
import { ConsentModel, type Consent } from './consent.model';

// DPDPA 2023 consent (docs/schemas.md §1.6, docs/api.md "Consent").
// The consent box at sign-in creates a record; withdrawing ends every session, and the next sign-in needs
// the box ticked again. Records are kept (with withdrawnAt) as evidence; they are never deleted here.

interface Who { institutionId: Types.ObjectId; userId: Types.ObjectId }

export function policy(): ConsentPolicy {
  return { policyVersion: CONSENT_POLICY_VERSION, url: PRIVACY_POLICY_PATH };
}

/** The user's active (not withdrawn) consent for the current policy version, if any. */
export async function currentConsent(who: Who): Promise<Consent | null> {
  return ConsentModel.findOne({ institutionId: who.institutionId, userId: who.userId, policyVersion: CONSENT_POLICY_VERSION, withdrawnAt: null })
    .sort({ acceptedAt: -1 })
    .lean();
}

/**
 * Sign-in: the consent box was ticked (validated by the shared schema). Record it unless already active.
 * `reconsent` marks a user who consented before (an older policy version, or withdrawn and back again).
 */
export async function recordConsentAtSignIn(who: Who, meta: { ip?: string; userAgent?: string }): Promise<Consent> {
  const existing = await currentConsent(who);
  if (existing) return existing;
  const before = await ConsentModel.exists({ institutionId: who.institutionId, userId: who.userId });
  const doc = await ConsentModel.create({
    institutionId: who.institutionId,
    userId: who.userId,
    policyVersion: CONSENT_POLICY_VERSION,
    acceptedAt: new Date(),
    source: before ? 'reconsent' : 'signin',
    withdrawnAt: null,
    ip: meta.ip?.slice(0, 64),
    userAgent: meta.userAgent?.slice(0, 300),
  });
  return doc.toObject();
}

/** GET /consent/me. The ip / user agent kept as evidence are not returned. */
export async function myConsent(who: Who): Promise<MyConsent> {
  const records = await ConsentModel.find({ institutionId: who.institutionId, userId: who.userId })
    .sort({ acceptedAt: -1, _id: -1 })
    .limit(100)
    .lean();
  const current = records.find((r) => r.policyVersion === CONSENT_POLICY_VERSION && !r.withdrawnAt);
  return {
    current: current ? { policyVersion: current.policyVersion, acceptedAt: current.acceptedAt.toISOString() } : null,
    history: records.map((r) => ({
      policyVersion: r.policyVersion,
      acceptedAt: r.acceptedAt.toISOString(),
      withdrawnAt: r.withdrawnAt ? r.withdrawnAt.toISOString() : null,
      source: r.source,
    })),
  };
}

/**
 * POST /consent/withdraw: mark every active record withdrawn, then end every session of the user (this one
 * included), so the app stops working for them at once. Audited. Safe to repeat.
 */
export async function withdrawConsent(who: Who, meta: { requestId?: string }): Promise<void> {
  const now = new Date();
  const withdrawn = await ConsentModel.updateMany(
    { institutionId: who.institutionId, userId: who.userId, withdrawnAt: null },
    { $set: { withdrawnAt: now } },
  );
  const sessions = await SessionModel.updateMany(
    { institutionId: who.institutionId, userId: who.userId, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: 'consent_withdrawn' } },
  );
  await audit({
    institutionId: who.institutionId, actorId: who.userId, action: 'consent.withdraw', targetType: 'user', targetId: who.userId,
    meta: { records: withdrawn.modifiedCount, sessionsRevoked: sessions.modifiedCount }, requestId: meta.requestId,
  });
}
