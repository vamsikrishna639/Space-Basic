import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { BedIcon } from '@phosphor-icons/react/dist/csr/Bed';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { ASSIGNABLE_ROLES, displayPhone, type Role, type UserSummary } from '@spacebasic/shared';
import { ApiError } from '../../../api/client';
import { useMe } from '../../../auth/AuthContext';
import { StaffLayout } from '../../staff/StaffLayout';
import { ADMIN_NAV } from '../../staff/StaffHomes';
import { ConfirmDialog, errorText, RoomPicker } from './RoomPicker';
import { createUser, getUser, setRoles, updateUser } from './usersApi';
import { editChanges, EMPTY_FORM, formErrors, formFrom, ROLE_HINT, ROLE_LABEL, toCreateBody, type UserForm } from './usersText';
import type { UsersFlash } from './UsersList';
import s from './AdminUsers.module.css';

// Admin > Users > Add user / a user's page (FREE DESIGN; docs/not-from-reference.md). The form is checked with the
// server's own schema before sending; the server checks everything again (roles, beds, uniqueness).

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');

function Field({ id, label, error, hint, wide, children }: { id: string; label: string; error?: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? s.wideField : undefined}>
      <label htmlFor={id} className={s.label}>{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className={s.fieldError}>{error}</p> : hint ? <p className={s.hint}>{hint}</p> : null}
    </div>
  );
}

const inputProps = (id: string, error?: string) => ({
  id, className: s.input, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined,
});

function Head({ title }: { title: string }) {
  return (
    <div className={s.head}>
      <div className={s.headLeft}>
        <Link to="/admin/users" className={s.back} aria-label="Back to Users">
          <CaretLeftIcon size={18} weight="bold" aria-hidden="true" />
        </Link>
        <h1>{title}</h1>
      </div>
    </div>
  );
}

export function AddUser() {
  return <UserEditor key="new" />;
}

export function EditUser() {
  const { id } = useParams();
  return <UserEditor key={id} id={id} />;
}

function UserEditor({ id }: { id?: string }) {
  const me = useMe();
  const navigate = useNavigate();
  const editing = id !== undefined;
  const self = editing && id === me.id;
  const canGrantSuper = me.roles.includes('super_admin');

  const [original, setOriginal] = useState<UserSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reEnablePick, setReEnablePick] = useState(false);

  useEffect(() => {
    if (!id) return;
    getUser(id)
      .then((u) => { setOriginal(u); setForm(formFrom(u, displayPhone)); })
      .catch((err) => setLoadError(err instanceof ApiError && err.status === 404 ? 'There is no such user.' : message(err)));
  }, [id]);

  const set = <K extends keyof UserForm>(k: K, v: UserForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => { const { [k]: _gone, form: _form, ...rest } = e; return rest; });
  };
  const toggleRole = (r: Role, on: boolean) => set('roles', on ? [...form.roles, r] : form.roles.filter((x) => x !== r));
  const roleChoices = ASSIGNABLE_ROLES.filter((r) => r !== 'super_admin' || canGrantSuper || form.roles.includes('super_admin'));
  const isStudent = form.roles.includes('student');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const errs = formErrors(form, { withPassword: !editing });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (!editing) {
        const created = await createUser(toCreateBody(form));
        navigate('/admin/users', { state: { flash: `Added ${created.fullName}${created.room ? ` in ${created.room.display}` : ''}.` } satisfies UsersFlash });
        return;
      }
      const { roles, fields } = editChanges(original!, form);
      if (!roles && !fields) { setNotice('Nothing to save.'); return; }
      let saved = original!;
      if (roles) { saved = await setRoles(saved.id, roles); setOriginal(saved); }
      if (fields) saved = await updateUser(saved.id, fields);
      setOriginal(saved);
      setForm(formFrom(saved, displayPhone));
      setNotice('Saved.');
    } catch (err) {
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ form: message(err) });
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: 'active' | 'disabled', roomCode?: string) {
    setBusy(true);
    setStatusError(null);
    try {
      const saved = await updateUser(original!.id, roomCode ? { status, roomCode } : { status });
      setOriginal(saved);
      setForm((f) => ({ ...f, roomCode: saved.room?.code ?? null }));
      setConfirmDisable(false);
      setReEnablePick(false);
      setNotice(status === 'disabled' ? `${saved.fullName} is disabled and signed out everywhere.` : `${saved.fullName} can sign in again.`);
    } catch (err) {
      if (roomCode) throw err; // the picker shows it
      setConfirmDisable(false);
      // Enabling into a room whose bed has gone since: offer another room.
      setStatusError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <StaffLayout area="admin" nav={ADMIN_NAV}>
        <Head title="User" />
        <p className={s.error} role="alert">{loadError}</p>
        <Link to="/admin/users" className={s.btn}>Back to Users</Link>
      </StaffLayout>
    );
  }
  if (editing && !original) {
    return (
      <StaffLayout area="admin" nav={ADMIN_NAV}>
        <Head title="User" />
        <p className={s.empty} aria-busy="true">Loading…</p>
      </StaffLayout>
    );
  }

  const disabled = original?.status === 'disabled';
  const roomChanged = editing && form.roomCode !== (original!.room?.code ?? null);
  return (
    <StaffLayout area="admin" nav={ADMIN_NAV}>
      <Head title={editing ? original!.fullName : 'Add user'} />
      <div aria-live="polite">
        {notice && (
          <p className={s.notice}>
            <CheckCircleIcon size={20} weight="fill" aria-hidden="true" />
            {notice}
          </p>
        )}
      </div>

      <form className={s.form} onSubmit={submit} noValidate>
        <section className={s.card} aria-labelledby="details-title">
          <h2 id="details-title">Details</h2>
          <p className={s.cardText}>They sign in with the email or the mobile number. Give one or both.</p>
          <div className={s.grid2}>
            <Field id="u-name" label="Full name" error={errors.fullName} wide>
              <input {...inputProps('u-name', errors.fullName)} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="off" maxLength={120} />
            </Field>
            <Field id="u-email" label="Email" error={errors.email}>
              <input {...inputProps('u-email', errors.email)} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@college.edu" autoComplete="off" />
            </Field>
            <Field id="u-phone" label="Mobile number" error={errors.phone}>
              <input {...inputProps('u-phone', errors.phone)} type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" autoComplete="off" />
            </Field>
          </div>
        </section>

        <section className={s.card} aria-labelledby="roles-title">
          <h2 id="roles-title">Roles</h2>
          <p className={s.cardText}>{self ? "You can't change your own roles." : 'Someone with two roles chooses which app to open after signing in.'}</p>
          <fieldset className={s.checks} aria-labelledby="roles-title" aria-describedby={errors.roles ? 'roles-error' : undefined}>
            {roleChoices.map((r) => (
              <label key={r} className={s.check}>
                <input
                  type="checkbox"
                  checked={form.roles.includes(r)}
                  onChange={(e) => toggleRole(r, e.target.checked)}
                  disabled={self || (r === 'super_admin' && !canGrantSuper)}
                />
                <span className={s.checkText}>
                  {ROLE_LABEL[r]}
                  {ROLE_HINT[r] && <small>{ROLE_HINT[r]}</small>}
                </span>
              </label>
            ))}
          </fieldset>
          {errors.roles && <p id="roles-error" className={s.fieldError}>{errors.roles}</p>}
          {editing && original!.roles.includes('student') && !isStudent && original!.room && (
            <p className={s.hint}>Saving takes them out of {original!.room.display}: only students have a room.</p>
          )}
        </section>

        {isStudent && (
          <section className={s.card} aria-labelledby="room-title">
            <h2 id="room-title">Room</h2>
            <p className={s.cardText}>Only rooms with a free bed can be chosen. A student can also wait for a room and be accepted later.</p>
            <div className={s.roomRow}>
              <span className={s.roomNow}>
                <BedIcon size={22} aria-hidden="true" />
                <span>{form.roomCode ?? <span className={s.muted}>No room yet</span>}</span>
              </span>
              <span className={s.actions}>
                <button type="button" className={`${s.btn} ${s.small}`} onClick={() => setPicking(true)}>
                  {form.roomCode ? 'Change room' : 'Choose room'}
                </button>
                {form.roomCode && (
                  <button type="button" className={`${s.btn} ${s.small} ${s.outline}`} onClick={() => set('roomCode', null)}>
                    {editing ? 'Move out' : 'No room'}
                  </button>
                )}
              </span>
            </div>
            {errors.roomCode ? <p className={s.fieldError} role="alert">{errors.roomCode}</p> : roomChanged ? <p className={s.hint}>Not saved yet.</p> : null}
          </section>
        )}

        {!editing && (
          <section className={s.card} aria-labelledby="password-title">
            <h2 id="password-title">First password</h2>
            <p className={s.cardText}>Without one they can only sign in with a one-time code sent to their email or phone, so give one unless codes are turned on for your college.</p>
            <Field id="u-password" label="Password" error={errors.password} hint="At least 8 characters, not their email or mobile number.">
              <div className={s.passwordBox}>
                <input {...inputProps('u-password', errors.password)} type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
                <button type="button" className={s.eye} onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  {showPassword ? <EyeSlashIcon size={20} aria-hidden="true" /> : <EyeIcon size={20} aria-hidden="true" />}
                </button>
              </div>
            </Field>
          </section>
        )}

        {errors.form && <p className={s.error} role="alert">{errors.form}</p>}
        <div className={s.formFoot}>
          <button type="submit" className={`${s.btn} ${s.primary} ${s.big}`} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add user'}
          </button>
          <Link to="/admin/users" className={`${s.btn} ${s.big}`}>Cancel</Link>
        </div>
      </form>

      {editing && (
        <section className={s.card} aria-labelledby="status-title" style={{ marginTop: 16, maxWidth: 720 }}>
          <h2 id="status-title">Account</h2>
          <div className={s.statusRow}>
            <p className={s.cardText} style={{ margin: 0 }}>
              {disabled
                ? "Disabled: they can't sign in. Their room is kept, but the bed counts as free."
                : original!.hasPassword ? 'Active. Signs in with a password or a one-time code.' : 'Active. Signs in with a one-time code.'}
            </p>
            {self ? (
              <span className={s.muted} style={{ fontSize: 13 }}>You can't disable your own account.</span>
            ) : disabled ? (
              <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => void setStatus('active')} disabled={busy}>Enable user</button>
            ) : (
              <button type="button" className={`${s.btn} ${s.dangerBtn}`} onClick={() => setConfirmDisable(true)} disabled={busy}>Disable user</button>
            )}
          </div>
          {statusError && (
            <div className={s.error} role="alert" style={{ margin: '12px 0 0' }}>
              {statusError}{' '}
              {original!.room && (
                <button type="button" className={`${s.btn} ${s.small}`} onClick={() => setReEnablePick(true)} style={{ marginLeft: 6 }}>
                  Choose another room
                </button>
              )}
            </div>
          )}
        </section>
      )}

      <RoomPicker
        open={picking}
        title={form.fullName.trim() ? `Room for ${form.fullName.trim()}` : 'Choose a room'}
        subtitle={editing ? 'Saved when you press Save changes.' : undefined}
        current={form.roomCode}
        action="Choose"
        onPick={(code) => { set('roomCode', code); setPicking(false); }}
        onClose={() => setPicking(false)}
      />
      {editing && (
        <>
          <RoomPicker
            open={reEnablePick}
            title={`Enable ${original!.fullName}`}
            subtitle="Their room is full now. Choose another room to enable them in."
            current={original!.room?.code}
            action="Enable in"
            onPick={(code) => setStatus('active', code)}
            onClose={() => setReEnablePick(false)}
          />
          <ConfirmDialog
            open={confirmDisable}
            title={`Disable ${original!.fullName}?`}
            confirm="Disable"
            danger
            busy={busy}
            onConfirm={() => void setStatus('disabled')}
            onClose={() => setConfirmDisable(false)}
          >
            <p>They're signed out everywhere at once and can't sign in until you enable them again. Their room is kept, but the bed counts as free while they're disabled.</p>
          </ConfirmDialog>
        </>
      )}
    </StaffLayout>
  );
}
