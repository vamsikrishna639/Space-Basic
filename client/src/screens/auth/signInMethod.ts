// Sign-in tab state lives in the URL (/sign-in/email, /sign-in/mobile) so Back and refresh keep the tab.
export type SignInMethod = 'email' | 'mobile';

export function parseSignInMethod(param: string | undefined): SignInMethod | null {
  return param === 'email' || param === 'mobile' ? param : null;
}

/** The submit button is disabled until the DPDPA consent box is ticked (SPEC.md, screens 2 and 3). */
export function canSubmit(consent: boolean): boolean {
  return consent;
}
