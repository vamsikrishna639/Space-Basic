import { z } from 'zod';

// Consent (DPDPA 2023). docs/api.md "Consent"; screen: Profile > Privacy & Consent (not from reference).

/** GET /consent/policy (public): the version the consent box at sign-in refers to. */
export interface ConsentPolicy {
  policyVersion: string;
  url: string;
}

export interface ConsentRecord {
  policyVersion: string;
  acceptedAt: string;
  withdrawnAt: string | null;
  source: 'signin' | 'reconsent';
}

/** GET /consent/me: the active consent for the current policy (if any) and every record, newest first. */
export interface MyConsent {
  current: { policyVersion: string; acceptedAt: string } | null;
  history: ConsentRecord[];
}

/** POST /consent/withdraw: an explicit confirmation, so a stray request can't withdraw by accident. */
export const withdrawConsentBodySchema = z.object({
  confirm: z.literal(true, { error: 'Confirm that you want to withdraw your consent' }),
});
export type WithdrawConsentBody = z.input<typeof withdrawConsentBodySchema>;
