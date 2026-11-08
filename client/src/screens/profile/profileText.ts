// My Profile text (reference-ui/07-profile.png).

/** The profile shows an Indian number as its 10 digits, "9876543210", as in the screenshot; others as stored. */
export function profilePhone(e164: string): string {
  return e164.startsWith('+91') && e164.length === 13 ? e164.slice(3) : e164;
}

/** Where each row leads. Rows without their own screen yet open ComingSoon (docs/not-from-reference.md). */
export const PROFILE_LINKS = {
  qr: '/profile/entry-pass',
  information: '/profile/information',
  password: '/profile/password',
  privacy: '/profile/privacy',
  settings: '/settings',
  about: '/about',
} as const;
