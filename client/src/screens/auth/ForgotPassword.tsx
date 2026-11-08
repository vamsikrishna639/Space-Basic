import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { passwordSchema } from '@spacebasic/shared';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { CodeInput } from '../../components/CodeInput';
import { TextField, trailingClass } from '../../components/TextField';
import { resetPassword, sendCode } from './codeApi';
import { CODE_LENGTH, errorMessage, formatCountdown, parseCodeSent, prefillOf, validateTarget } from './codeFlow';
import { useResendCountdown } from './useResendCountdown';
import s from './SignIn.module.css';
import c from './CodeFlow.module.css';

// Forgot password: /forgot-password (email) then /forgot-password/code (code and new password). No screenshot:
// built from the Sign in screen's layout and components (docs/not-from-reference.md).

/** Step 1: the email address. The API answers the same whether or not the account exists (no enumeration). */
export function ForgotPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => prefillOf(location.state));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const target = validateTarget('email', email);
    if ('error' in target) { setError(target.error); return; }
    setBusy(true);
    setError(null);
    try {
      const sent = await sendCode('reset', 'email', target.identifier);
      // Keep the typed address on this entry, so Back from the next step finds it again.
      navigate(location.pathname, { replace: true, state: { prefill: email } });
      navigate('/forgot-password/code', { state: sent });
    } catch (err) {
      setError(errorMessage(err, 'email'));
      setBusy(false);
    }
  }

  return (
    <form className={`screen ${s.screen}`} noValidate onSubmit={submit}>
      <BackButton onClick={() => navigate('/sign-in/email', { replace: true, state: { prefill: email } })} />
      <h1 className={s.title}>Reset your password</h1>
      <p className={s.sub}>We'll email a four-digit code to the address your college registered you with.</p>

      <TextField
        className={c.first}
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        placeholder="name@college.edu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className={s.submit}>
        <Button type="submit" variant="primary" disabled={!email.trim() || busy} aria-busy={busy}>Send code</Button>
        {error && <p className={s.helper} role="alert">{error}</p>}
      </div>
    </form>
  );
}

/** Step 2: the code and the new password. Success signs the account out everywhere (the API revokes all sessions). */
export function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const sent = parseCodeSent(location.state);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const left = useResendCountdown(sent?.sentAt ?? 0, sent?.resendAfter ?? 0);

  useEffect(() => { codeRef.current?.focus(); }, []);

  if (!sent || sent.channel !== 'email') return <Navigate to="/forgot-password" replace />;
  const email = sent.identifier;
  const toSignIn = () => navigate('/sign-in/email', { replace: true, state: { prefill: email } });

  if (done) {
    return (
      <div className={`screen ${s.screen}`}>
        <BackButton onClick={toSignIn} />
        <h1 className={s.title}>Password changed</h1>
        <p className={s.sub}>You've been signed out on every device. Log in with your new password.</p>
        <div className={s.submit}>
          <Button variant="primary" onClick={toSignIn}>Back to sign in</Button>
        </div>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || code.length !== CODE_LENGTH) return;
    const rule = passwordSchema.safeParse(password);
    if (!rule.success) { setError(rule.error.issues[0]?.message ?? 'Enter a password'); passwordRef.current?.focus(); return; }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email, code, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, 'newPassword'));
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCode('');
    try {
      const next = await sendCode('reset', 'email', email);
      navigate(location.pathname, { replace: true, state: next });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      codeRef.current?.focus();
    }
  }

  return (
    <form className={`screen ${s.screen}`} noValidate onSubmit={submit}>
      <BackButton onClick={() => navigate(-1)} />
      <h1 className={s.title}>Reset your password</h1>
      <p className={s.sub}>Enter the code we sent to {email}, then choose a new password.</p>

      <CodeInput className={c.first} inputRef={codeRef} value={code} onChange={setCode} onComplete={() => passwordRef.current?.focus()} disabled={busy} />
      {left > 0 ? (
        <p className={c.wait} aria-live="off">Resend code in {formatCountdown(left)}</p>
      ) : (
        <button type="button" className={s.link} onClick={() => void resend()} disabled={busy}>Resend code</button>
      )}

      <TextField
        ref={passwordRef}
        className={c.next}
        label="New password"
        type={showPassword ? 'text' : 'password'}
        name="new-password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        trailing={
          <button type="button" className={trailingClass} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? <EyeSlashIcon size={19.07} aria-hidden="true" /> : <EyeIcon size={19.07} aria-hidden="true" />}
          </button>
        }
      />

      <div className={s.submit}>
        <Button type="submit" variant="primary" disabled={code.length !== CODE_LENGTH || !password || busy} aria-busy={busy}>Reset password</Button>
        {error && <p className={s.helper} role="alert">{error}</p>}
      </div>
    </form>
  );
}
