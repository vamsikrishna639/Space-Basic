import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react/dist/csr/EnvelopeSimple';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { useAuth, useMe } from '../../auth/AuthContext';
import { Avatar } from '../../components/app/Avatar';
import { CameraBadge } from '../../components/app/CameraBadge';
import { CutoutIcon, type CutoutName } from '../../components/CutoutIcon';
import { PROFILE_LINKS, profilePhone } from './profileText';
import s from './Profile.module.css';

interface Row { to: string; label: string; icon: CutoutName; size: number }

const ACCOUNT: Row[] = [
  { to: PROFILE_LINKS.information, label: 'My Information', icon: 'user', size: 20 },
  { to: PROFILE_LINKS.password, label: 'Change Password', icon: 'key', size: 20 },
  { to: PROFILE_LINKS.privacy, label: 'Privacy & Consent', icon: 'shield-check', size: 20 },
];
const APP: Row[] = [
  { to: PROFILE_LINKS.settings, label: 'Settings', icon: 'settings', size: 20 },
  { to: PROFILE_LINKS.about, label: 'About', icon: 'info-circle', size: 18 },
];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className={s.card}>
      {rows.map((r) => (
        <li key={r.to}>
          <Link to={r.to} className={s.row}>
            <span className={s.tile}><CutoutIcon name={r.icon} size={r.size} /></span>
            <span className={s.label}>{r.label}</span>
            <CaretRightIcon className={s.chevron} size={14.77} weight="bold" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Screen 7 (reference-ui/07-profile.png and 07-profile(1).png). The header and the profile card stay put while
 * the lists scroll under them (the second screenshot is the same screen scrolled to the end).
 */
export function Profile() {
  const me = useMe();
  const { logout, updateMe } = useAuth();
  const navigate = useNavigate();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await logout(); // the session ends even if the network call fails
    navigate('/', { replace: true });
  }

  return (
    <div className={`app-screen ${s.screen}`}>
      <div className={s.top}>
        <header className={s.header}>
          <h1 className={s.title}>My Profile</h1>
        </header>

        <section className={s.profile} aria-label="Your profile">
          <div className={s.avatar}>
            <Avatar src={me.avatarUrl} size={66} />
            <CameraBadge
              onUploaded={(avatarUrl) => { setPhotoError(null); updateMe({ avatarUrl }); }}
              onError={setPhotoError}
            />
          </div>
          <div className={s.details}>
            <h2 className={s.name}>{me.fullName}</h2>
            {me.room && (
              <span className={s.chip}>
                <CutoutIcon name="bed-room" size={14} />
                {me.room.display}
              </span>
            )}
            {me.phone && (
              <span className={`${s.contact} ${s.phone}`}>
                <CutoutIcon className={s.contactIcon} name="phone" size={15} />
                {profilePhone(me.phone)}
              </span>
            )}
            {me.email && (
              <span className={`${s.contact} ${s.email}`}>
                <EnvelopeSimpleIcon className={s.contactIcon} size={15.2} aria-hidden="true" />
                <span className={s.emailText}>{me.email}</span>
              </span>
            )}
          </div>
          {photoError && <p className={s.photoError} role="alert">{photoError}</p>}

          <Link to={PROFILE_LINKS.qr} className={s.qr}>
            <span className={s.qrTile}><CutoutIcon name="qr-code" size={20} /></span>
            <span className={s.qrText}>
              <span className={s.qrTitle}>Show my QR code</span>
              <span className={s.qrSub}>Attendance, amenities and check-in</span>
            </span>
            <CaretRightIcon className={s.qrChevron} size={14.77} weight="bold" aria-hidden="true" />
          </Link>
        </section>
      </div>

      <h2 className={`${s.section} ${s.first}`}>Account</h2>
      <Rows rows={ACCOUNT} />
      <h2 className={s.section}>App</h2>
      <Rows rows={APP} />

      <div className={`${s.card} ${s.signOutCard}`}>
        <button type="button" className={`${s.row} ${s.signOut}`} onClick={() => void signOut()} disabled={signingOut} aria-busy={signingOut}>
          <span className={`${s.tile} ${s.signOutTile}`}><CutoutIcon name="logout" size={19} /></span>
          <span className={s.label}>Sign Out</span>
        </button>
      </div>

      {/* /profile/entry-pass: the Entry Pass sheet */}
      <Outlet />
    </div>
  );
}
