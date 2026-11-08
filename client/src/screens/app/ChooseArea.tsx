import { Navigate, useNavigate } from 'react-router';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { StudentIcon } from '@phosphor-icons/react/dist/csr/Student';
import { IdentificationBadgeIcon } from '@phosphor-icons/react/dist/csr/IdentificationBadge';
import { ShieldStarIcon } from '@phosphor-icons/react/dist/csr/ShieldStar';
import { useAuth, useMe } from '../../auth/AuthContext';
import { AREAS, areasFor, landingFor, rememberArea, type Area } from '../../auth/areas';
import s from './ChooseArea.module.css';

// "Continue as" (FREE DESIGN, docs/not-from-reference.md): for users with more than one role. Shown after sign-in
// until a choice is made on this device, and from the switch in each app. The choice is remembered per user.

const ICONS: Record<Area, React.ReactNode> = {
  student: <StudentIcon size={22} aria-hidden="true" />,
  warden: <IdentificationBadgeIcon size={22} aria-hidden="true" />,
  admin: <ShieldStarIcon size={22} aria-hidden="true" />,
};

export function ChooseArea() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const choose = (a: Area) => {
    rememberArea(me.id, a);
    navigate(AREAS[a].home, { replace: true });
  };
  if (areasFor(me.roles).length < 2) return <Navigate to={landingFor(me)} replace />; // nothing to choose
  return (
    <div className={`app-screen ${s.screen}`}>
      <h1 className={s.title}>Continue as</h1>
      <p className={s.lead}>Your account has more than one role. You can switch at any time.</p>
      <ul className={s.list}>
        {areasFor(me.roles).map((a) => (
          <li key={a}>
            <button type="button" className={s.option} onClick={() => choose(a)}>
              <span className={s.tile}>{ICONS[a]}</span>
              <span className={s.text}>
                <span className={s.label}>{AREAS[a].label}</span>
                <span className={s.blurb}>{AREAS[a].blurb}</span>
              </span>
              <CaretRightIcon className={s.chevron} size={14.77} weight="bold" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={s.signOut} onClick={() => void logout().then(() => navigate('/', { replace: true }))}>Sign out</button>
    </div>
  );
}

/** A signed-in account with no app in Phase 1 (e.g. mess staff, before the Mess module). */
export function NoAccess() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  if (areasFor(me.roles).length > 0) return <Navigate to={landingFor(me)} replace />;
  return (
    <div className={`app-screen ${s.screen}`}>
      <h1 className={s.title}>Nothing here yet</h1>
      <p className={s.lead}>There's no app for your account's role yet. Ask your hostel office if you think this is wrong.</p>
      <button type="button" className={s.signOut} onClick={() => void logout().then(() => navigate('/', { replace: true }))}>Sign out</button>
    </div>
  );
}
