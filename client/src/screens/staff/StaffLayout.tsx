import { useId, useRef, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/csr/ArrowsLeftRight';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { useAuth, useMe } from '../../auth/AuthContext';
import { AREAS, areasFor, rememberArea, type Area } from '../../auth/areas';
import { Avatar } from '../../components/app/Avatar';
import s from './StaffLayout.module.css';

// Staff screens are FREE DESIGN (docs/decisions.md 2026-11-08; listed in docs/not-from-reference.md): the app's
// tokens, Plus Jakarta Sans, Phosphor icons and shared components, light and dark. Wardens: phone-first.
// Admins: a sidebar from 960 px, a scrolling strip of sections on phones.

export interface StaffNavItem { to: string; label: string; icon: ReactNode; end?: boolean }

/** The account button: who is signed in, the switch to the user's other areas (only with two or more), Sign out. */
function AccountMenu({ current }: { current: Area }) {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const others = areasFor(me.roles).filter((a) => a !== current);

  const switchTo = (a: Area) => {
    rememberArea(me.id, a);
    menu.current?.hidePopover();
    navigate(AREAS[a].home);
  };
  const signOut = async () => {
    menu.current?.hidePopover();
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <>
      <button type="button" className={s.account} popoverTarget={id} aria-label={`Account: ${me.fullName}`}>
        <Avatar src={me.avatarUrl} size={32} />
        <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
      </button>
      <div id={id} ref={menu} popover="auto" className={s.menu}>
        <p className={s.menuName}>{me.fullName}</p>
        {me.email && <p className={s.menuSub}>{me.email}</p>}
        {others.length > 0 && (
          <div className={s.menuGroup} role="group" aria-label="Switch to">
            <p className={s.menuLabel}>Switch to</p>
            {others.map((a) => (
              <button key={a} type="button" className={s.menuItem} onClick={() => switchTo(a)}>
                <ArrowsLeftRightIcon size={18} aria-hidden="true" />
                {AREAS[a].label}
              </button>
            ))}
          </div>
        )}
        <button type="button" className={`${s.menuItem} ${s.signOut}`} onClick={() => void signOut()}>
          <SignOutIcon size={18} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </>
  );
}

export function StaffLayout({ area, nav, children }: { area: 'warden' | 'admin'; nav?: StaffNavItem[]; children: ReactNode }) {
  const me = useMe();
  return (
    <div className={`${s.staff} ${area === 'admin' ? s.wide : s.narrow}`}>
      <header className={s.top}>
        <Link to={AREAS[area].home} className={s.brand}>
          {me.institution.logoUrl && (
            <span className={s.logoTile}><img src={me.institution.logoUrl} alt="" /></span>
          )}
          <span className={s.brandText}>
            <span className={s.institution}>{me.institution.name}</span>
            <span className={s.areaName}>{AREAS[area].label}</span>
          </span>
        </Link>
        <AccountMenu current={area} />
      </header>
      <div className={s.body}>
        {nav && (
          <nav className={s.nav} aria-label={`${AREAS[area].label} sections`}>
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? `${s.navItem} ${s.active}` : s.navItem)}>
                {n.icon}
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
        <main className={s.main}>{children}</main>
      </div>
    </div>
  );
}

/** A page title, with a back link on the warden's phone-first pages. */
export function StaffTitle({ title, back, children }: { title: string; back?: string; children?: ReactNode }) {
  return (
    <div className={s.titleRow}>
      {back && (
        <Link to={back} className={s.back} aria-label="Back">
          <CaretLeftIcon size={18} weight="bold" aria-hidden="true" />
        </Link>
      )}
      <h1 className={s.title}>{title}</h1>
      {children}
    </div>
  );
}

/** Sections built at the next checkpoints. */
export function StaffSoon({ area, title, back, nav }: { area: 'warden' | 'admin'; title: string; back?: string; nav?: StaffNavItem[] }) {
  return (
    <StaffLayout area={area} nav={nav}>
      <StaffTitle title={title} back={back} />
      <p className={s.soon}>Coming soon</p>
    </StaffLayout>
  );
}

/** A tappable card: icon tile, title, one line, chevron. */
export function StaffCard({ to, icon, title, text }: { to: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className={s.card}>
      <span className={s.tile}>{icon}</span>
      <span className={s.cardText}>
        <span className={s.cardTitle}>{title}</span>
        <span className={s.cardSub}>{text}</span>
      </span>
    </Link>
  );
}

export const staffStyles = s;
