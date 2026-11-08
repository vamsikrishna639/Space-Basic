import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { formatIndianMobile } from '@spacebasic/shared';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { ConsentCard } from '../../components/ConsentCard';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextField, trailingClass } from '../../components/TextField';
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
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mobile, setMobile] = useState('');

  const parsed = parseSignInMethod(method);
  if (!parsed) return <Navigate to="/sign-in/email" replace />;
  const m: SignInMethod = parsed;

  return (
    <form className={`screen ${s.screen}`} noValidate onSubmit={(e) => e.preventDefault()}>
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
        onChange={(v) => navigate(`/sign-in/${v}`, { replace: true })}
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
            aside={<button type="button" className={s.aside}>Forgot password?</button>}
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
          <button type="button" className={s.link}>Email me a one-time code instead</button>
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
          <button type="button" className={s.link}>Send it on WhatsApp instead</button>
        </>
      )}

      <ConsentCard className={s.consent} checked={consent} onChange={setConsent} />
      <a className={s.privacy} href="/privacy-policy">Read the Privacy Policy</a>

      <div className={s.submit}>
        <Button type="submit" variant="primary" disabled={!canSubmit(consent)}>{m === 'email' ? 'Log in' : 'Send code'}</Button>
        {!consent && <p className={s.helper}>Tick the consent box above to continue</p>}
      </div>
    </form>
  );
}
