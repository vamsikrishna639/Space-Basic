import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { CodeInput } from '../../components/CodeInput';
import { sendCode } from './codeApi';
import { CODE_LENGTH, describeTarget, errorMessage, formatCountdown, parseCodeSent, prefillFor } from './codeFlow';
import { useResendCountdown } from './useResendCountdown';
import s from './SignIn.module.css';
import c from './CodeFlow.module.css';

/**
 * One-time-code sign-in (email, SMS or WhatsApp). Route /sign-in/code, reached from Sign in after the consent box
 * was ticked; the channel and address come in the router state. Not from a screenshot (docs/not-from-reference.md).
 */
export function OtpEntry() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loginWithCode } = useAuth();
  const sent = parseCodeSent(location.state);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const left = useResendCountdown(sent?.sentAt ?? 0, sent?.resendAfter ?? 0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  if (!sent) return <Navigate to="/sign-in/email" replace />;
  const tab = sent.channel === 'email' ? '/sign-in/email' : '/sign-in/mobile';

  async function verify(value: string) {
    if (!sent || value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithCode(sent.channel, sent.identifier, value);
      // Signed in: the router sends the user to Home.
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function resend() {
    if (!sent || busy) return;
    setBusy(true);
    setError(null);
    setCode('');
    try {
      const next = await sendCode('login', sent.channel, sent.identifier);
      navigate(location.pathname, { replace: true, state: next });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function back() {
    // Sign in again with the same address filled in (the consent box has to be ticked again).
    navigate(tab, { replace: true, state: { prefill: prefillFor(sent!.channel, sent!.identifier) } });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void verify(code);
  }

  return (
    <form className={`screen ${s.screen}`} noValidate onSubmit={submit}>
      <BackButton onClick={back} />
      <h1 className={s.title}>Enter the code</h1>
      <p className={s.sub}>We sent a four-digit code to {describeTarget(sent.channel, sent.identifier)}.</p>

      <CodeInput className={c.first} inputRef={inputRef} value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} />
      {left > 0 ? (
        <p className={c.wait} aria-live="off">Resend code in {formatCountdown(left)}</p>
      ) : (
        <button type="button" className={s.link} onClick={() => void resend()} disabled={busy}>Resend code</button>
      )}

      <div className={s.submit}>
        <Button type="submit" variant="primary" disabled={code.length !== CODE_LENGTH || busy} aria-busy={busy}>Log in</Button>
        {error && <p className={s.helper} role="alert">{error}</p>}
      </div>
    </form>
  );
}
