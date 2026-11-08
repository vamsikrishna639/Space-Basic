import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { passwordIsIdentity, passwordSchema, PASSWORD_IS_IDENTITY_MESSAGE, type MyConsent } from '@spacebasic/shared';
import { api, ApiError } from '../../api/client';
import { useAuth, useMe } from '../../auth/AuthContext';
import { PageHeader } from '../../components/app/PageHeader';
import { lastUpdatedLabel } from '../settings/deviceInfo';
import s from './AccountScreens.module.css';

// Change Password and Privacy & Consent: supporting screens WITHOUT a screenshot (SPEC.md Phase 1 scope 3;
// docs/not-from-reference.md). Built plainly from the in-app tokens and the Settings card style.

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');

function PasswordField({ id, label, value, onChange, show, autoComplete, error }: {
  id: string; label: string; value: string; onChange: (v: string) => void; show: boolean; autoComplete: string; error?: string;
}) {
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>{label}</label>
      <input
        id={id}
        className={s.input}
        type={show ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p id={`${id}-error`} className={s.fieldError}>{error}</p>}
    </div>
  );
}

export function ChangePassword() {
  const me = useMe();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!current) errs.current = 'Enter your current password';
    const rule = passwordSchema.safeParse(next);
    if (!rule.success) errs.next = rule.error.issues[0]?.message ?? 'Enter a password';
    else if (passwordIsIdentity(next, me.email, me.phone)) errs.next = PASSWORD_IS_IDENTITY_MESSAGE;
    else if (next === current) errs.next = 'Choose a password you have not used here';
    if (!errs.next && again !== next) errs.again = "The two new passwords don't match";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api<void>('POST', '/auth/password/change', { body: { currentPassword: current, newPassword: next } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') setErrors({ current: 'That is not your current password' });
      else if (err instanceof ApiError && err.fields?.newPassword) setErrors({ next: err.fields.newPassword });
      else setErrors({ form: message(err) });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={`app-screen ${s.screen}`}>
        <PageHeader title="Change Password" backTo="/profile" />
        <div className={s.body}>
          <section className={s.card} role="status">
            <h2 className={s.cardTitle}>Password changed</h2>
            <p className={s.text}>You're still signed in here. Other phones and browsers were signed out and will need the new password.</p>
          </section>
          <button type="button" className={s.primary} onClick={() => navigate('/profile', { replace: true })}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-screen ${s.screen}`}>
      <PageHeader title="Change Password" backTo="/profile" />
      <form className={s.body} onSubmit={(e) => void submit(e)} noValidate>
        <section className={s.card}>
          <PasswordField id="pw-current" label="Current password" value={current} onChange={setCurrent} show={show} autoComplete="current-password" error={errors.current} />
          <PasswordField id="pw-new" label="New password" value={next} onChange={setNext} show={show} autoComplete="new-password" error={errors.next} />
          <PasswordField id="pw-again" label="New password again" value={again} onChange={setAgain} show={show} autoComplete="new-password" error={errors.again} />
          <p className={s.hint}>At least 8 characters, and not your email or mobile number.</p>
          <button type="button" className={s.showToggle} onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? <EyeSlashIcon size={18} aria-hidden="true" /> : <EyeIcon size={18} aria-hidden="true" />}
            {show ? 'Hide passwords' : 'Show passwords'}
          </button>
        </section>
        {errors.form && <p className={s.formError} role="alert">{errors.form}</p>}
        <button type="submit" className={s.primary} disabled={busy} aria-busy={busy}>Change password</button>
      </form>
    </div>
  );
}

export function PrivacyConsent() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [consent, setConsent] = useState<MyConsent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    api<MyConsent>('GET', '/consent/me').then(setConsent, (err: unknown) => setError(message(err)));
  }, []);
  useEffect(() => {
    const d = dialog.current;
    if (confirming && d && !d.open) d.showModal();
    if (!confirming && d?.open) d.close();
  }, [confirming]);

  async function withdraw() {
    setBusy(true);
    try {
      await api<void>('POST', '/consent/withdraw', { body: { confirm: true } });
      await logout().catch(() => undefined); // the server has already ended every session
      navigate('/', { replace: true });
    } catch (err) {
      setBusy(false);
      setConfirming(false);
      setError(message(err));
    }
  }

  const current = consent?.current;
  return (
    <div className={`app-screen ${s.screen}`}>
      <PageHeader title="Privacy & Consent" backTo="/profile" />
      <div className={s.body}>
        <section className={s.card} aria-labelledby="consent-title">
          <h2 id="consent-title" className={s.cardTitle}>Your consent</h2>
          <p className={s.text}>
            You allowed SpaceBasic to collect and use your personal data for hostel management under DPDPA 2023, as
            described in our Privacy Policy. SpaceBasic acts as a data processor.
          </p>
          {consent && (
            <dl className={s.facts}>
              <div><dt>Given</dt><dd>{current ? lastUpdatedLabel(current.acceptedAt) : 'Not given'}</dd></div>
              <div><dt>Policy version</dt><dd>{current?.policyVersion ?? 'None'}</dd></div>
            </dl>
          )}
          {!consent && !error && <p className={s.text} aria-busy="true">Loading…</p>}
        </section>

        {consent && consent.history.length > 1 && (
          <section className={s.card} aria-labelledby="history-title">
            <h2 id="history-title" className={s.cardTitle}>History</h2>
            <ul className={s.history}>
              {consent.history.map((h) => (
                <li key={h.acceptedAt}>
                  <span>{lastUpdatedLabel(h.acceptedAt)}</span>
                  <span className={s.muted}>{h.withdrawnAt ? `withdrawn ${lastUpdatedLabel(h.withdrawnAt)}` : `version ${h.policyVersion}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && <p className={s.formError} role="alert">{error}</p>}
        {current && (
          <>
            <p className={s.text}>Withdrawing signs you out on every device. To use SpaceBasic again you'll be asked for your consent when you sign in.</p>
            <button type="button" className={s.danger} onClick={() => setConfirming(true)}>Withdraw consent</button>
          </>
        )}
      </div>

      <dialog ref={dialog} className={s.confirm} aria-labelledby="withdraw-title" onClose={() => setConfirming(false)} onCancel={() => setConfirming(false)}>
        <h2 id="withdraw-title" className={s.cardTitle}>Withdraw your consent?</h2>
        <p className={s.text}>You'll be signed out on every device straight away.</p>
        <div className={s.actions}>
          <button type="button" className={s.secondary} onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          <button type="button" className={s.danger} onClick={() => void withdraw()} disabled={busy} aria-busy={busy}>Withdraw</button>
        </div>
      </dialog>
    </div>
  );
}
