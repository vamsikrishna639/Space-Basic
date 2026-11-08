import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { HouseSimpleIcon } from '@phosphor-icons/react/dist/csr/HouseSimple';
import { BellSimpleIcon } from '@phosphor-icons/react/dist/csr/BellSimple';
import { HeadsetIcon } from '@phosphor-icons/react/dist/csr/Headset';
import type { UnreadCount } from '@spacebasic/shared';
import { api } from '../../api/client';
import { useMe } from '../../auth/AuthContext';
import { badgeText } from '../../screens/home/homeText';
import { Avatar } from './Avatar';
import s from './TabBar.module.css';

/** Home, Notifications (unread badge), Support, My Profile (the user's avatar). Icon weights and sizes: §4. */
export function TabBar() {
  const me = useMe();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!me.institution.enabledModules.includes('notifications')) return;
    api<UnreadCount>('GET', '/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => setUnread(0));
  }, [me]);
  const badge = badgeText(unread);
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? `${s.tab} ${s.active}` : s.tab);

  return (
    <nav className={s.bar} aria-label="Main">
      <NavLink to="/home" className={cls}>
        {({ isActive }) => (
          <>
            <span className={s.icon}><HouseSimpleIcon size={21.89} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" /></span>
            <span className={s.label}>Home</span>
          </>
        )}
      </NavLink>
      <NavLink to="/notifications" className={cls}>
        {({ isActive }) => (
          <>
            <span className={s.icon}>
              <BellSimpleIcon size={22.01} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />
              {badge && <span className={s.badge} aria-label={`${unread} unread`}>{badge}</span>}
            </span>
            <span className={s.label}>Notifications</span>
          </>
        )}
      </NavLink>
      <NavLink to="/support" className={cls}>
        {({ isActive }) => (
          <>
            <span className={s.icon}><HeadsetIcon size={21.75} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" /></span>
            <span className={s.label}>Support</span>
          </>
        )}
      </NavLink>
      <NavLink to="/profile" className={cls}>
        <span className={s.icon}><span className={s.avatarRing}><Avatar src={me.avatarUrl} size={21.667} /></span></span>
        <span className={s.label}>My Profile</span>
      </NavLink>
    </nav>
  );
}
