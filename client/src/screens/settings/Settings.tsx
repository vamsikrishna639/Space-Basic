import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/app/PageHeader';
import { CutoutIcon, type CutoutName } from '../../components/CutoutIcon';
import { saveChoice, storedChoice, type ThemeChoice } from '../../theme/theme';
import { haptic, setPref, usePref, type Pref } from '../../settings/feedback';
import { BUILD, bundleId, deviceId, lastUpdatedLabel, readDevice, UNKNOWN, type DeviceInfo } from './deviceInfo';
import s from './Settings.module.css';

// Screen 9, Settings (reference-ui/settings-dark.png at the top, settings-light.png scrolled to the end;
// docs/ui-measurements.md §15). Every "About this app" value comes from the build or the device.

/** "11.1.1-20261103-082255-57a23685" may break after each hyphen (a hyphen before a digit is not a break point). */
function breakAfterHyphens(text: string): ReactNode {
  return text.split('-').map((part, i, all) => <Fragment key={i}>{part}{i < all.length - 1 && <>-<wbr /></>}</Fragment>);
}

function AboutCard() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  useEffect(() => { void readDevice().then(setDevice); }, []);
  const v = (x: string | undefined) => x ?? UNKNOWN;
  const rows: [label: string, value: ReactNode, mono?: boolean][] = [
    ['App version', BUILD.version],
    ['Web bundle', breakAfterHyphens(bundleId(BUILD)), true],
    ['Last updated', lastUpdatedLabel(BUILD.time)],
    ['Operating system', v(device?.os)],
    ['OS version', v(device?.osVersion)],
    ['Device', v(device?.maker)],
    ['Model', v(device?.model)],
    ['Device ID', deviceId(), true],
  ];
  return (
    <section className={`${s.card} ${s.about}`} aria-labelledby="about-app">
      <h2 id="about-app" className={s.cardLabel}>About this app</h2>
      <dl className={s.rows}>
        {rows.map(([label, value, mono]) => (
          <div key={label} className={`${s.row} ${label === 'Web bundle' ? s.bundleRow : ''}`}>
            <dt className={s.rowLabel}>{label}</dt>
            <dd className={mono ? s.mono : s.rowValue}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function Appearance() {
  const [choice, setChoice] = useState<ThemeChoice>(storedChoice);
  const selected = CHOICES.findIndex((c) => c.value === choice);
  const pick = (c: ThemeChoice) => { haptic(); setChoice(c); saveChoice(c); };
  return (
    <div className={s.appearance}>
      <p className={s.titleLine}>
        <span id="appearance" className={s.title}>Appearance</span>
        <span className={s.beta}>BETA</span>
      </p>
      <p className={s.sub}>System matches your phone's light or dark setting</p>
      <div className={s.segmented} role="radiogroup" aria-labelledby="appearance">
        {CHOICES.map((c, i) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={i === selected}
            // A separator sits between two segments that are both unselected (as in the dark screenshot).
            className={`${s.segment} ${i === selected ? s.on : ''} ${i > 0 && i !== selected && i - 1 !== selected ? s.sep : ''}`}
            onClick={() => pick(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ pref, title, beta, sub }: { pref: Pref; title: string; beta?: boolean; sub: string }) {
  const on = usePref(pref);
  const id = `pref-${pref}`;
  return (
    <div className={s.toggleRow}>
      <div className={s.toggleText}>
        <p className={s.titleLine}>
          <span id={id} className={s.title}>{title}</span>
          {beta && <span className={s.beta}>BETA</span>}
        </p>
        <p className={`${s.sub} ${s.toggleSub}`}>{sub}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        className={`${s.switch} ${on ? s.switchOn : ''}`}
        onClick={() => { setPref(pref, !on); if (!on && pref === 'haptics') haptic(); }}
      >
        <span className={s.knob} />
      </button>
    </div>
  );
}

function LinkRow({ to, onClick, icon, size, title, sub, danger }: { to?: string; onClick?: () => void; icon: CutoutName; size: number; title: string; sub: string; danger?: boolean }) {
  const body = (
    <>
      <span className={`${s.tile} ${danger ? s.dangerTile : ''}`}><CutoutIcon name={icon} size={size} /></span>
      <span className={s.linkText}>
        <span className={s.title}>{title}</span>
        <span className={`${s.sub} ${s.linkSub}`}>{sub}</span>
      </span>
      <CaretRightIcon className={s.chevron} size={14.77} weight="bold" aria-hidden="true" />
    </>
  );
  return to
    ? <Link to={to} className={s.link}>{body}</Link>
    : <button type="button" className={s.link} onClick={onClick}>{body}</button>;
}

/** "Clear stored data": a plain confirm (no screenshot), then sign out and delete everything this app stored. */
function ClearData({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  async function clear() {
    setBusy(true);
    await logout().catch(() => undefined); // the session ends even if the network call fails
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* unavailable */ }
    try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* no Cache API */ }
    try {
      for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
    } catch { /* no IndexedDB */ }
    navigate('/', { replace: true });
  }
  return (
    <dialog ref={ref} className={s.confirm} aria-labelledby="clear-title" onClose={onClose} onCancel={onClose}>
      <h2 id="clear-title" className={s.confirmTitle}>Clear stored data?</h2>
      <p className={s.confirmText}>This signs you out and deletes cached files and saved data on this device. Your account isn't affected.</p>
      <div className={s.confirmActions}>
        <button type="button" className={s.confirmCancel} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={s.confirmDanger} onClick={() => void clear()} disabled={busy} aria-busy={busy}>Clear and sign out</button>
      </div>
    </dialog>
  );
}

export function Settings() {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`app-screen ${s.screen}`}>
      <PageHeader title="Settings" backTo="/profile" />
      <div className={s.body}>
        <AboutCard />
        <section className={`${s.card} ${s.prefs}`} aria-label="Preferences">
          <Appearance />
          <Toggle pref="haptics" title="Haptic feedback" sub="Vibrate on taps, and on success or failure" />
          <Toggle pref="sounds" title="Sounds" beta sub="A short chime on success or failure; follows your silent switch" />
        </section>
        <nav className={`${s.card} ${s.links}`} aria-label="More settings">
          <LinkRow to="/settings/accessibility" icon="accessibility" size={22} title="Accessibility" sub="Text size, motion, contrast and messages" />
          <LinkRow to="/settings/connection" icon="gauge" size={21} title="Check connection" sub="Tests whether the app can reach SpaceBasic, and how fast" />
          <LinkRow onClick={() => setConfirm(true)} icon="trash" size={20} title="Clear stored data" sub="Signs you out and deletes cached files and saved data" danger />
        </nav>
      </div>
      <ClearData open={confirm} onClose={() => setConfirm(false)} />
    </div>
  );
}
