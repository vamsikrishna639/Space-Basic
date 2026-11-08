// The one-time code's shape: four digits (shared/src/schemas/common.ts, otpCodeSchema).
export const CODE_LENGTH = 4;

/** Digits only, at most four (paste, autofill and typing all go through this). */
export function sanitizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_LENGTH);
}
