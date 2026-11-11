import { useCallback, useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { XCircleIcon } from '@phosphor-icons/react/dist/csr/XCircle';
import { CameraSlashIcon } from '@phosphor-icons/react/dist/csr/CameraSlash';
import type { ScanResult } from '@spacebasic/shared';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { chime, haptic } from '../../settings/feedback';
import { StaffLayout, StaffTitle } from '../staff/StaffLayout';
import { CAMERA_TEXT, diagnoseCamera, errorOutcome, looksLikePass, NOT_A_PASS, okOutcome, type CameraProblem, type Outcome } from './scanText';
import s from './Scan.module.css';

// Warden: scan a student's Entry Pass (FREE DESIGN, phone-first; docs/not-from-reference.md). The back camera
// through qr-scanner (MIT); each pass code goes to POST /attendance/scan, which checks it, logs attendance and
// sends the student "Attendance Marked". After each result the scanner takes the next code by itself.

/** How long a result holds the scanner before it takes the next code (a success is quicker to read). */
export const RESUME_AFTER_MS = { ok: 2000, warn: 3000, error: 3000 } as const;

type CameraState = 'starting' | 'on' | CameraProblem;

const TONE_ICON = { ok: CheckCircleIcon, warn: WarningCircleIcon, error: XCircleIcon } as const;

export function ScanScreen() {
  const video = useRef<HTMLDivElement>(null); // holds the current scanner's <video>, made in the effect below
  const scanner = useRef<QrScanner | null>(null);
  const holding = useRef(false); // a code is being checked or its result is on screen
  const lastCode = useRef(''); // the same code stays in view for many frames: act on it once
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [camera, setCamera] = useState<CameraState>('starting');
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [ready, setReady] = useState(true);

  const onCode = useCallback(async (text: string) => {
    const code = text.trim();
    if (holding.current || code === lastCode.current) return;
    holding.current = true;
    lastCode.current = code;
    setReady(false);
    let result: Outcome;
    if (!looksLikePass(code)) {
      result = NOT_A_PASS;
    } else {
      setChecking(true);
      try {
        result = okOutcome(await api<ScanResult>('POST', '/attendance/scan', { body: { token: code } }));
      } catch (e) {
        result = errorOutcome(e);
      }
      setChecking(false);
    }
    setOutcome(result);
    haptic(result.tone === 'ok' ? 'success' : 'failure');
    chime(result.tone === 'ok' ? 'success' : 'failure');
    resumeTimer.current = setTimeout(() => {
      holding.current = false;
      setReady(true);
    }, RESUME_AFTER_MS[result.tone]);
  }, []);

  /** Start `sc` (or the current scanner); state changes from a scanner that has been replaced are ignored. */
  const start = useCallback(async (sc: QrScanner | null = scanner.current) => {
    if (!sc) return;
    const current = () => scanner.current === sc;
    setCamera('starting');
    try {
      await sc.start();
      if (current()) setCamera('on');
    } catch (e) {
      if (!current()) return;
      const md = navigator.mediaDevices;
      const problem = await diagnoseCamera(e, { secure: window.isSecureContext, getUserMedia: md?.getUserMedia ? (c) => md.getUserMedia(c) : undefined });
      if (current()) setCamera(problem);
    }
  }, []);

  // One scanner per mount, each with its OWN <video>: React mounts twice in development, and leaving and returning
  // quickly does the same, so an old scanner may still be opening the camera while the new one starts. Sharing
  // one <video> left the picture black. The old one is destroyed only after its start has settled, so a camera
  // stream that arrives late is still stopped.
  useEffect(() => {
    const v = document.createElement('video');
    v.className = s.video;
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('aria-label', 'Camera');
    video.current!.append(v);
    const sc: QrScanner = new QrScanner(v, (r) => { if (scanner.current === sc) void onCode(r.data); }, {
      preferredCamera: 'environment',
      maxScansPerSecond: 8,
      returnDetailedScanResult: true,
    });
    scanner.current = sc;
    const started = start(sc);
    return () => {
      clearTimeout(resumeTimer.current);
      if (scanner.current === sc) scanner.current = null;
      void started.finally(() => {
        sc.destroy(); // stops the camera
        v.remove();
      });
    };
  }, [onCode, start]);

  /** Take the next code now instead of waiting (also lets the same code be checked again). */
  const next = () => {
    clearTimeout(resumeTimer.current);
    holding.current = false;
    lastCode.current = '';
    setReady(true);
  };

  const problem = camera !== 'starting' && camera !== 'on' ? CAMERA_TEXT[camera] : null;
  const Icon = outcome ? TONE_ICON[outcome.tone] : null;

  return (
    <StaffLayout area="warden">
      <StaffTitle title="Scan entry passes" back="/warden" />

      <div className={s.viewport}>
        <div ref={video} className={s.videoBox} />
        {camera === 'on' && <div className={s.frame} aria-hidden="true" />}
        {camera === 'starting' && <p className={s.cameraNote}>Starting the camera…</p>}
        {problem && (
          <div className={s.cameraProblem} role="alert">
            <CameraSlashIcon size={32} aria-hidden="true" />
            <p className={s.problemTitle}>{problem.title}</p>
            <p className={s.problemText}>{problem.text}</p>
            {camera !== 'none' && camera !== 'insecure' && <Button onClick={() => void start()}>Try again</Button>}
          </div>
        )}
      </div>

      <p className={s.status} aria-live="polite">
        {camera !== 'on' ? '' : checking ? 'Checking…' : ready ? 'Point the camera at the student’s Entry Pass.' : 'Hold on…'}
      </p>

      <div aria-live="polite" aria-atomic="true">
        {outcome && Icon && (
          <section className={`${s.result} ${s[outcome.tone]}`} aria-label="Last scan">
            <Icon size={28} weight="fill" aria-hidden="true" className={s.resultIcon} />
            <div className={s.resultText}>
              <p className={s.resultTitle}>{outcome.title}</p>
              {outcome.lines.map((l, i) => (
                <p key={i} className={i === 0 && outcome.tone === 'ok' ? s.resultName : s.resultLine}>{l}</p>
              ))}
            </div>
          </section>
        )}
      </div>

      {outcome && !ready && camera === 'on' && (
        <button type="button" className={s.next} onClick={next}>Scan next now</button>
      )}
    </StaffLayout>
  );
}
