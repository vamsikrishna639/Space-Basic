import { CLIENT_HEADER, type ApiErrorBody, type AuthResult, type ErrorCode } from '@spacebasic/shared';

// REST client (docs/architecture.md, "Sessions"). The 15-minute access token lives only in memory; the rotating
// refresh token is an httpOnly cookie that only /auth/refresh and /auth/logout see. Same origin in every
// environment (Vite proxy in development, Vercel rewrite in production), so the cookie is first-party.

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK',
    message: string,
    public readonly fields?: Record<string, string>,
    /** Seconds from a 429's Retry-After header (the OTP resend cooldown), when present. */
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let onSessionEnded: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function hasAccessToken(): boolean {
  return accessToken !== null;
}
/** Called when the session can't be renewed (signed out elsewhere, consent withdrawn, refresh reused). */
export function onSessionEnd(fn: (() => void) | null): void {
  onSessionEnded = fn;
}

const NETWORK_MESSAGE = "We couldn't reach SpaceBasic. Check your connection and try again.";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One fetch, retried once after a pause when the server can't be reached or answers 502/503/504: the free Render
 * instance can take up to about a minute to wake (decisions.md), and the caller keeps showing its loading state.
 */
async function send(path: string, init: RequestInit, retryUnavailable = true): Promise<Response> {
  try {
    const res = await fetch(BASE + path, { credentials: 'same-origin', ...init });
    if (retryUnavailable && [502, 503, 504].includes(res.status)) {
      await wait(2000);
      return send(path, init, false);
    }
    return res;
  } catch {
    if (retryUnavailable) {
      await wait(2000);
      return send(path, init, false);
    }
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE);
  }
}

async function toError(res: Response): Promise<ApiError> {
  const retry = Number(res.headers.get('Retry-After'));
  const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : undefined;
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error.code, body.error.message, body.error.fields, retryAfter);
  } catch {
    return new ApiError(res.status, 'INTERNAL', 'Something went wrong on our side. Please try again.');
  }
}

// ---- refresh (deduplicated: several requests can hit an expired token at once) --------------------------
let refreshing: Promise<AuthResult> | null = null;

export function refreshSession(): Promise<AuthResult> {
  refreshing ??= (async () => {
    try {
      for (let attempt = 0; ; attempt++) {
        const res = await send('/auth/refresh', { method: 'POST', headers: { [CLIENT_HEADER]: '1' } });
        if (res.ok) {
          const result = (await res.json()) as AuthResult;
          setAccessToken(result.accessToken);
          return result;
        }
        const err = await toError(res);
        // Two tabs refreshed with the same cookie at once: the other one won; try once more with the new cookie.
        if (err.code === 'REFRESH_RACE' && attempt === 0) { await wait(300); continue; }
        setAccessToken(null);
        throw err;
      }
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---- requests ----------------------------------------------------------------------------------------------
interface Options { body?: unknown; headers?: Record<string, string>; auth?: boolean }

export async function api<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  const call = () => {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return send(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  };
  let res = await call();
  // Expired access token: renew it once through the cookie and repeat the request.
  if (res.status === 401 && opts.auth !== false && accessToken) {
    const err = await toError(res);
    if (err.code !== 'TOKEN_EXPIRED' && err.code !== 'UNAUTHENTICATED') throw err;
    try {
      await refreshSession();
    } catch (refreshErr) {
      onSessionEnded?.();
      throw refreshErr;
    }
    res = await call();
  }
  if (!res.ok) throw await toError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** An authenticated binary GET (the avatar: an <img> can't send the Bearer token). null on 404. */
export async function apiBlob(path: string): Promise<Blob | null> {
  const relative = path.startsWith(BASE) ? path.slice(BASE.length) : path;
  const get = () => send(relative, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  let res = await get();
  if (res.status === 401 && accessToken) {
    await refreshSession();
    res = await get();
  }
  if (res.status === 404) return null;
  if (!res.ok) throw await toError(res);
  return res.blob();
}

export async function logoutRequest(): Promise<void> {
  try {
    await send('/auth/logout', { method: 'POST', headers: { [CLIENT_HEADER]: '1' } }, false);
  } finally {
    setAccessToken(null);
  }
}
