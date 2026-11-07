import type { Types } from 'mongoose';
import { CONSENT_POLICY_VERSION } from '@spacebasic/shared';
import { ConsentModel, type Consent } from './consent.model';

interface Who { institutionId: Types.ObjectId; userId: Types.ObjectId }

/** The user's active (not withdrawn) consent for the current policy version, if any. */
export async function currentConsent(who: Who): Promise<Consent | null> {
  return ConsentModel.findOne({ institutionId: who.institutionId, userId: who.userId, policyVersion: CONSENT_POLICY_VERSION, withdrawnAt: null })
    .sort({ acceptedAt: -1 })
    .lean();
}

/** Sign-in: the consent box was ticked (validated by the shared schema). Record it unless already active. */
export async function recordConsentAtSignIn(who: Who, meta: { ip?: string; userAgent?: string }): Promise<Consent> {
  const existing = await currentConsent(who);
  if (existing) return existing;
  const doc = await ConsentModel.create({
    institutionId: who.institutionId,
    userId: who.userId,
    policyVersion: CONSENT_POLICY_VERSION,
    acceptedAt: new Date(),
    source: 'signin',
    withdrawnAt: null,
    ip: meta.ip?.slice(0, 64),
    userAgent: meta.userAgent?.slice(0, 300),
  });
  return doc.toObject();
}
