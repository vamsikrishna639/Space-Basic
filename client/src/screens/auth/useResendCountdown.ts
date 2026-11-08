import { useEffect, useState } from 'react';
import { secondsLeft } from './codeFlow';

/** Seconds until a new code can be requested; re-renders while it counts down. */
export function useResendCountdown(sentAt: number, resendAfter: number): number {
  const [now, setNow] = useState(() => Date.now());
  const left = secondsLeft(sentAt, resendAfter, now);
  useEffect(() => {
    setNow(Date.now());
    if (secondsLeft(sentAt, resendAfter, Date.now()) === 0) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (secondsLeft(sentAt, resendAfter, t) === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [sentAt, resendAfter]);
  return left;
}
