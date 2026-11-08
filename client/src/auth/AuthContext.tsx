import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CONSENT_POLICY_VERSION, type AuthResult, type Me, type OtpChannel } from '@spacebasic/shared';
import { api, logoutRequest, onSessionEnd, refreshSession, setAccessToken } from '../api/client';
import { setUnread } from '../notifications/unread';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  me: Me | null;
  /** Email + password sign-in. Ticking the consent box is what makes this call possible (SPEC.md screen 3). */
  login: (email: string, password: string) => Promise<void>;
  /** One-time-code sign-in (email, SMS or WhatsApp). The code screen is only reached after the consent box was ticked. */
  loginWithCode: (channel: OtpChannel, identifier: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Merge a change into the signed-in profile (e.g. the new avatar URL after an upload). */
  updateMe: (patch: Partial<Me>) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const signedIn = useCallback((result: AuthResult) => {
    setAccessToken(result.accessToken);
    setMe(result.user);
    setStatus('signedIn');
  }, []);
  const signedOut = useCallback(() => {
    setAccessToken(null);
    setMe(null);
    setUnread(0); // the next user's badge starts from their own count
    setStatus('signedOut');
  }, []);

  // On start, the refresh cookie (if any) restores the session; the access token is never stored.
  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((r) => { if (!cancelled) signedIn(r); })
      .catch(() => { if (!cancelled) signedOut(); });
    onSessionEnd(signedOut);
    return () => { cancelled = true; onSessionEnd(null); };
  }, [signedIn, signedOut]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<AuthResult>('POST', '/auth/login', {
      auth: false,
      body: { email, password, consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION } },
    });
    signedIn(result);
  }, [signedIn]);

  const loginWithCode = useCallback(async (channel: OtpChannel, identifier: string, code: string) => {
    const result = await api<AuthResult>('POST', '/auth/otp/verify', {
      auth: false,
      body: { channel, identifier, code, consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION } },
    });
    signedIn(result);
  }, [signedIn]);

  const logout = useCallback(async () => {
    try { await logoutRequest(); } finally { signedOut(); }
  }, [signedOut]);

  const updateMe = useCallback((patch: Partial<Me>) => setMe((m) => (m ? { ...m, ...patch } : m)), []);

  const value = useMemo(() => ({ status, me, login, loginWithCode, logout, updateMe }), [status, me, login, loginWithCode, logout, updateMe]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** For screens inside the signed-in area, where `me` is always set. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe while signed out');
  return me;
}
