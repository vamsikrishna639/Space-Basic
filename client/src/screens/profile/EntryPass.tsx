import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { QR_TOKEN_TTL_SECONDS, type QrTokenResult } from '@spacebasic/shared';
import { api, ApiError } from '../../api/client';
import { useMe } from '../../auth/AuthContext';
import { isFinalError, isStale, PREFETCH_MS, remainingMs, RETRY_MS, ringFraction, secondsLeft } from './entryPassClock';
import { drawPassQr } from './entryPassQr';
import s from './EntryPass.module.css';

// Screen 8, Entry Pass (reference-ui/QR_entry-pass.png): a bottom sheet over My Profile with a QR that changes
// every 10 s. The token is short-lived, single-use and holds no personal data (docs/api.md "Attendance"); it lives
// only in this component's memory.

const RING_R = 10;
const RING_C = 2 * Math.PI * RING_R;
const CLOSE_MS = 280; // the slide-down, as long as the slide-up in the stylesheet

interface Code { token: string; receivedAt: number; startAt: number; cycleMs: number }
type Problem = null | 'retrying' | 'unavailable';

/** Fetches a code, shows it for its cycle, fetches the next one just before it is due and swaps without a gap. */
function usePassCode(ring: React.RefObject<SVGCircleElement | null>) {
  const [token, setToken] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  useEffect(() => {
    let live = true;
    let inflight = false;
    let unavailable = false;
    let retryAt = 0;
    let current: Code | null = null;
    let next: Omit<Code, 'startAt'> | null = null;
    let raf = 0;

    const show = (c: Code) => { current = c; setToken(c.token); };

    async function fetchCode() {
      inflight = true;
      try {
        const r = await api<QrTokenResult>('GET', '/attendance/qr-token');
        if (!live) return;
        const got = { token: r.token, receivedAt: Date.now(), cycleMs: r.refreshAfterMs };
        const now = Date.now();
        if (!current || now >= current.startAt + current.cycleMs || isStale(current.receivedAt, now, QR_TOKEN_TTL_SECONDS)) show({ ...got, startAt: now });
        else next = got;
        setProblem(null);
      } catch (err) {
        if (!live) return;
        if (isFinalError(err instanceof ApiError ? err.status : 0)) { unavailable = true; setProblem('unavailable'); }
        else { retryAt = Date.now() + RETRY_MS; setProblem('retrying'); }
      } finally {
        inflight = false;
      }
    }

    function tick() {
      const now = Date.now();
      if (current && next && now >= current.startAt + current.cycleMs) { show({ ...next, startAt: now }); next = null; }
      const due = !current || now >= current.startAt + current.cycleMs - PREFETCH_MS;
      if (!unavailable && !inflight && !next && now >= retryAt && due) void fetchCode();
      if (current) {
        const left = remainingMs(current.startAt, current.cycleMs, now);
        const f = ringFraction(left, current.cycleMs);
        ring.current?.setAttribute('stroke-dashoffset', String(RING_C * (1 - f)));
        ring.current?.setAttribute('visibility', f > 0 ? 'visible' : 'hidden'); // a 0-length round cap is still a dot
        setSeconds(secondsLeft(left)); // React skips the render when the value is unchanged
        setStale(isStale(current.receivedAt, now, QR_TOKEN_TTL_SECONDS));
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { live = false; cancelAnimationFrame(raf); };
  }, [ring]);

  return { token: stale ? null : token, seconds, stale, problem };
}

export function EntryPass() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const [closing, setClosing] = useState(false);
  const labelId = useId();
  const nameId = useId();
  const { token, seconds, stale, problem } = usePassCode(ring);

  const leave = useCallback(() => {
    // Opened from the profile row: go back to it. Opened directly (a reload or a link): replace with the profile.
    if (location.key !== 'default') navigate(-1);
    else navigate('/profile', { replace: true });
  }, [location.key, navigate]);

  const close = useCallback(() => {
    if (closing) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { leave(); return; }
    setClosing(true);
    window.setTimeout(leave, CLOSE_MS);
  }, [closing, leave]);

  // Modal: top layer (above the tab bar) and the page behind is inert. Focus starts on the sheet itself, so a screen
  // reader begins at "Entry Pass" and no focus ring is drawn on the close button.
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    sheet.current?.focus();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden'; // the profile behind doesn't scroll under the sheet
    return () => { root.style.overflow = overflow; };
  }, []);

  useEffect(() => {
    if (canvas.current && token) void drawPassQr(canvas.current, token);
  }, [token]);

  const status =
    problem === 'unavailable' ? "Your entry pass isn't available. Ask your hostel office."
      : stale || (problem === 'retrying' && !token) ? "Can't refresh your pass. Trying again…"
        : null;

  return (
    <dialog
      ref={dialog}
      className={`${s.dialog} ${closing ? s.closing : ''}`}
      aria-labelledby={`${labelId} ${nameId}`}
      // Escape, or the Android back gesture: animate out like the close button.
      onCancel={(e) => { e.preventDefault(); close(); }}
      // A tap on the dimmed profile (the dialog's own box, outside the sheet) closes it too.
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <section ref={sheet} className={s.sheet} tabIndex={-1}>
        <p id={labelId} className={s.label}>Entry Pass</p>
        <h2 id={nameId} className={s.name}>{me.fullName}</h2>
        {me.room && <p className={s.room}>{me.room.display}</p>}
        <button type="button" className={s.close} aria-label="Close" onClick={close}>
          <XIcon size={15.02} weight="bold" aria-hidden="true" />
        </button>

        <div className={s.card}>
          {token && <canvas ref={canvas} className={s.qr} role="img" aria-label="Your entry pass QR code" />}
        </div>

        <div className={s.countdown}>
          {status ? (
            <span className={s.status} role="status">{status}</span>
          ) : (
            <span className={s.timer} hidden={seconds === null}>
              <svg className={s.ring} viewBox="0 0 22.667 22.667" aria-hidden="true">
                <circle className={s.track} cx="11.333" cy="11.333" r={RING_R} />
                {/* Clockwise from 12 o'clock, as measured */}
                <circle ref={ring} className={s.arc} cx="11.333" cy="11.333" r={RING_R} transform="rotate(-90 11.333 11.333)" strokeDasharray={RING_C} strokeDashoffset={0} />
              </svg>
              <span className={s.expires}>Expires in <b className={s.seconds}>{seconds ?? ''}s</b></span>
            </span>
          )}
        </div>

        <p className={s.footer}>Scanned for attendance, amenities and check-in.</p>
      </section>
    </dialog>
  );
}
