// Entry Pass timing (reference-ui/QR_entry-pass.png; docs/ui-measurements.md §14).
//
// The screenshot's ring is drawn clockwise from 12 o'clock to 312.3° while the label says "Expires in 9s": the ring
// drains continuously over the 10 s refresh cycle (8.68 s left) and the label rounds up.

/** Ask for the next code this long before the one on screen is due to change, so the swap has no gap. */
export const PREFETCH_MS = 800;
/** After a failed request, try again this soon. */
export const RETRY_MS = 2000;
/** Stop showing a code this long before the server stops accepting it. */
export const STALE_MARGIN_MS = 1000;

/** Milliseconds left in the current code's cycle (never negative). */
export function remainingMs(startAt: number, cycleMs: number, now: number): number {
  return Math.max(0, startAt + cycleMs - now);
}

/** How much of the ring is drawn, 1 (full) down to 0. */
export function ringFraction(remaining: number, cycleMs: number): number {
  return cycleMs > 0 ? Math.min(1, Math.max(0, remaining / cycleMs)) : 0;
}

/** The whole seconds shown after "Expires in": 8.68 s left reads "9s". */
export function secondsLeft(remaining: number): number {
  return Math.ceil(remaining / 1000);
}

/**
 * A code arrived at `receivedAt` (local clock, so server clock skew doesn't matter; the server's TTL starts a
 * little earlier, at issue). It is hidden once it is about to stop working.
 */
export function isStale(receivedAt: number, now: number, ttlSeconds: number): boolean {
  return now >= receivedAt + ttlSeconds * 1000 - STALE_MARGIN_MS;
}

/** Errors that another try won't fix (the pass isn't available to this account). Network and 5xx are retried. */
export function isFinalError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
