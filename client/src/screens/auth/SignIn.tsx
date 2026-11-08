import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { formatIndianMobile, type OtpChannel } from '@spacebasic/shared';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { ConsentCard } from '../../components/ConsentCard';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextField, trailingClass } from '../../components/TextField';
import { sendCode } from './codeApi';
import { errorMessage, prefillOf, validateTarget } from './codeFlow';
import { canSubmit, parseSignInMethod, type SignInMethod } from './signInMethod';
import s from './SignIn.module.css';

const METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'mobile', label: 'Mobile' },
] as const;

/** Screens 2 and 3 (reference-ui/02-signin-mobile.png, 03-signin-email.png). Route: /sign-in/:method */
export function SignIn() {
  const { method } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Back from a code screen or Forgot password fills the address in again (router state, never stored).
  const prefill = prefillOf(location.state);
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState(() => (prefill.includes('@') ? prefill : ''));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mobile, setMobile] = useState(() => (prefill.includes('@') ? '' : prefill));
  const consentRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();

  const parsed = parseSignInMethod(method);
  if (!parsed) return <Navigate to="/sign-in/email" replace />;
  const m: SignInMethod = parsed;

  /** "Send code", "Send it on WhatsApp instead" and "Email me a one-time code instead": open the code screen. */
  async function requestCode(channel: OtpChannel) {
    if (busy) return;
    if (!canSubmit(consent)) { consentRef.current?.focus(); return; }
    const typed = channel === 'email' ? email : mobile;
    const target = validateTarget(channel, typed);
    if ('error' in target) { setError(target.error); return; }
    setBusy(true);
    setError(null);
    try {
      const sent = await sendCode('login', channel, target.identifier);
      navigate(location.pathname, { replace: true, state: { prefill: typed } }); // Back finds the address again
      navigate('/sign-in/code', { state: sent });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit(consent) || busy) return;
    if (m === 'mobile') { await requestCode('sms'); return; }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      // Signed in: the router sends the user to Home.
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setError(apiErr?.fields?.email ?? apiErr?.fields?.password ?? apiErr?.message ?? 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form className={`screen ${s.screen}`} noValidate onSubmit={submit}>
      <BackButton onClick={() => navigate('/')} />
      <h1 className={s.title}>Sign in</h1>
      <p className={s.sub}>
        {m === 'email' ? 'Use the email address your college registered you with.' : "We'll send a four-digit code to your phone."}
      </p>

      <SegmentedControl
        className={s.segments}
        label="Sign in with"
        options={METHODS}
        value={m}
        onChange={(v) => { setError(null); navigate(`/sign-in/${v}`, { replace: true }); }}
      />

      {m === 'email' ? (
        <>
          <TextField
            className={s.firstField}
            label="Email"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            placeholder="name@college.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            className={s.passwordField}
            label="Password"
            aside={<button type="button" className={s.aside} onClick={() => navigate('/forgot-password', { state: { prefill: email } })}>Forgot password?</button>}
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            trailing={
              <button type="button" className={trailingClass} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeSlashIcon size={19.07} aria-hidden="true" /> : <EyeIcon size={19.07} aria-hidden="true" />}
              </button>
            }
          />
          <button type="button" className={s.link} onClick={() => void requestCode('email')}>Email me a one-time code instead</button>
        </>
      ) : (
        <>
          <TextField
            className={s.firstField}
            label="Mobile number"
            type="tel"
            name="mobile"
            autoComplete="tel-national"
            inputMode="numeric"
            placeholder="98765 43210"
            value={mobile}
            onChange={(e) => setMobile(formatIndianMobile(e.target.value))}
          />
          <button type="button" className={s.link} onClick={() => void requestCode('whatsapp')}>Send it on WhatsApp instead</button>
        </>
      )}

      <ConsentCard className={s.consent} inputRef={consentRef} checked={consent} onChange={setConsent} />
      <a className={s.privacy} href="/privacy-policy">Read the Privacy Policy</a>

      <div className={s.submit}>
        <Button type="submit" variant="primary" disabled={!canSubmit(consent) || busy} aria-busy={busy}>{m === 'email' ? 'Log in' : 'Send code'}</Button>
        {!consent && <p className={s.helper}>Tick the consent box above to continue</p>}
        {consent && error && <p className={s.helper} role="alert">{error}</p>}
      </div>
    </form>
  );
}
