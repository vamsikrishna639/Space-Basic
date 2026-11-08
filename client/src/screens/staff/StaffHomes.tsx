import { ScanIcon } from '@phosphor-icons/react/dist/csr/Scan';
import { ListChecksIcon } from '@phosphor-icons/react/dist/csr/ListChecks';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { BuildingsIcon } from '@phosphor-icons/react/dist/csr/Buildings';
import { HeadsetIcon } from '@phosphor-icons/react/dist/csr/Headset';
import { ClipboardTextIcon } from '@phosphor-icons/react/dist/csr/ClipboardText';
import { firstNameOf } from '@spacebasic/shared';
import { useMe } from '../../auth/AuthContext';
import { greetingFor, homeDate } from '../home/homeText';
import { StaffCard, StaffLayout, staffStyles as s, type StaffNavItem } from './StaffLayout';

// Staff homes (FREE DESIGN; docs/not-from-reference.md). Plain at this checkpoint: each card opens its section,
// which is built at the next checkpoints (warden, then admin).

type Icon = typeof ScanIcon;
interface Section { to: string; title: string; text: string; Icon: Icon }

export const WARDEN_SECTIONS: Section[] = [
  { to: '/warden/scan', title: 'Scan entry passes', text: "Point the camera at a student's QR code", Icon: ScanIcon },
  { to: '/warden/attendance', title: "Today's attendance", text: 'Everyone scanned today, newest first', Icon: ListChecksIcon },
  { to: '/warden/lookup', title: 'Find a student or room', text: 'Search by name, or open a room to see who lives there', Icon: MagnifyingGlassIcon },
];

export const ADMIN_SECTIONS: Section[] = [
  { to: '/admin/users', title: 'Users', text: 'Search, add and edit users, roles and CSV import', Icon: UsersIcon },
  { to: '/admin/hostel', title: 'Hostel', text: 'Blocks, floors, rooms and beds', Icon: BuildingsIcon },
  { to: '/admin/support', title: 'Support', text: 'The contacts and questions students see under Help', Icon: HeadsetIcon },
  { to: '/admin/audit', title: 'Audit log', text: 'Who changed what, and when', Icon: ClipboardTextIcon },
];

export const ADMIN_NAV: StaffNavItem[] = [
  { to: '/admin', label: 'Overview', end: true, icon: <SquaresFourIcon size={18} aria-hidden="true" /> },
  ...ADMIN_SECTIONS.map(({ to, title, Icon }) => ({ to, label: title, icon: <Icon size={18} aria-hidden="true" /> })),
];

const cards = (list: Section[]) => list.map(({ Icon, ...x }) => <li key={x.to}><StaffCard {...x} icon={<Icon size={22} aria-hidden="true" />} /></li>);

function Greeting() {
  const me = useMe();
  const now = new Date();
  return (
    <>
      <h1 className={s.greeting}>{greetingFor(now)}, {firstNameOf(me.fullName)}</h1>
      <p className={s.date}>{homeDate(now)}</p>
    </>
  );
}

export function WardenHome() {
  return (
    <StaffLayout area="warden">
      <Greeting />
      <ul className={s.cards}>
        {cards(WARDEN_SECTIONS)}
      </ul>
    </StaffLayout>
  );
}

export function AdminHome() {
  return (
    <StaffLayout area="admin" nav={ADMIN_NAV}>
      <Greeting />
      <ul className={s.cards}>
        {cards(ADMIN_SECTIONS)}
      </ul>
    </StaffLayout>
  );
}
