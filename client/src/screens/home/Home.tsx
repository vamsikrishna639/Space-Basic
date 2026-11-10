import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/csr/CalendarDots';
import { WrenchIcon } from '@phosphor-icons/react/dist/csr/Wrench';
import { ForkKnifeIcon } from '@phosphor-icons/react/dist/csr/ForkKnife';
import { MegaphoneSimpleIcon } from '@phosphor-icons/react/dist/csr/MegaphoneSimple';
import { MODULES, type ModuleKey } from '@spacebasic/shared';
import { useMe } from '../../auth/AuthContext';
import { HOME_APPS, QUICK_ACTIONS, type QuickActionIcon } from '../../config/quickActions';
import { greetingFor, greetingName, homeDate, isLongAppLabel } from './homeText';
import { seasonalHomeAt } from './seasonal';
import { DiwaliGreeting, DiwaliLamps, diwaliAfterCardClass, diwaliHeaderClass } from './DiwaliHome';
import s from './Home.module.css';

// Icon weights and sizes: docs/ui-measurements.md §4 (Phosphor, one import per icon).
const CHIP_ICON: Record<QuickActionIcon, React.ReactNode> = {
  calendar: <CalendarDotsIcon size={17.42} weight="bold" aria-hidden="true" />,
  wrench: <WrenchIcon size={18.01} weight="regular" aria-hidden="true" />,
  utensils: <ForkKnifeIcon size={18.11} weight="regular" aria-hidden="true" />,
};
const APP_ICON: Partial<Record<ModuleKey, React.ReactNode>> = {
  leave: <CalendarDotsIcon size={24.82} weight="regular" aria-hidden="true" />,
  tickets: <WrenchIcon size={24.4} weight="regular" aria-hidden="true" />,
  announcements: <MegaphoneSimpleIcon size={25.22} weight="regular" aria-hidden="true" />,
  mess: <ForkKnifeIcon size={24.84} weight="regular" aria-hidden="true" />,
};

/** The clock for the greeting and date; updated every minute. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Screen 4 (reference-ui/04-home.png). With the seasonal switch on (config/seasonal.ts), the Diwali look
 * (reference-ui/home-diwali-dark.png) adds to it; with it off, nothing below differs from the normal Home. */
export function Home() {
  const me = useMe();
  const now = useNow();
  const enabled = new Set(me.institution.enabledModules);
  const actions = QUICK_ACTIONS.filter((a) => enabled.has(a.module));
  const apps = HOME_APPS.filter((m) => enabled.has(m));
  const diwali = seasonalHomeAt(now) === 'diwali';
  // Seasonal: the first section label after the greeting card sits closer to it.
  const afterCard = diwali ? ` ${diwaliAfterCardClass}` : '';

  return (
    <div className="app-screen">
      <header className={diwali ? `${s.header} ${diwaliHeaderClass}` : s.header}>
        <div className={s.brand}>
          <span className={s.tile}>
            {me.institution.logoUrl && <img className={s.logo} src={me.institution.logoUrl} alt="" />}
          </span>
          <span className={s.institution}>{me.institution.name}</span>
        </div>
        <h1 className={s.greeting}>{greetingFor(now)}, {greetingName(me.firstName)}</h1>
        <p className={s.date}>{homeDate(now)}</p>
        {diwali && <DiwaliLamps />}
      </header>

      <main className={s.body}>
        {diwali && <DiwaliGreeting name={greetingName(me.firstName)} />}
        {actions.length > 0 && (
          <>
            <h2 className={`${s.section}${afterCard}`}>Quick actions</h2>
            <div className={s.chips} data-testid="quick-actions">
              {actions.map((a) => (
                <Link key={a.module} to={`/m/${a.module}`} className={s.chip}>
                  <span className={s.chipIcon}>{CHIP_ICON[a.icon]}</span>
                  {a.label}
                </Link>
              ))}
            </div>
          </>
        )}
        {apps.length > 0 && (
          <>
            <h2 className={`${s.section} ${s.apps}${actions.length === 0 ? afterCard : ''}`}>Apps</h2>
            <nav className={s.card} aria-label="Apps">
              {apps.map((m) => (
                <Link key={m} to={`/m/${m}`} className={s.app}>
                  <span className={s.appTile}>{APP_ICON[m]}</span>
                  <span className={`${s.appLabel} ${isLongAppLabel(MODULES[m].title) ? s.appLabelLong : ''}`}>{MODULES[m].title}</span>
                </Link>
              ))}
            </nav>
          </>
        )}
      </main>
    </div>
  );
}
