import { SEASONAL_HOME, SEASONAL_HOME_ENDS, type SeasonalHome } from '../../config/seasonal';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The phone's local date as 'YYYY-MM-DD'. */
export function localDay(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** True for '' (no end date) or a real calendar date written as 'YYYY-MM-DD'. */
export function isValidEndDate(ends: string): boolean {
  if (ends === '') return true;
  const m = DAY.exec(ends);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return localDay(d) === ends;
}

/**
 * Which seasonal Home shows at `now`: `season` until the end of the `ends` day (phone's date), then null.
 * An end date that isn't a valid 'YYYY-MM-DD' turns the season off (a unit test keeps the constant valid).
 */
export function resolveSeasonalHome(season: SeasonalHome | null, ends: string, now: Date): SeasonalHome | null {
  if (!season) return null;
  if (!isValidEndDate(ends)) return null;
  if (ends !== '' && localDay(now) > ends) return null;
  return season;
}

/**
 * The configured season (config/seasonal.ts). Visual-test builds only (`npm run test:visual` sets
 * __VISUAL_TEST__): the season comes from localStorage 'sb.visual.seasonalHome' instead, so one build can render
 * both the normal Home and the Diwali Home. Production builds drop this branch.
 */
function configuredSeason(): SeasonalHome | null {
  if (__VISUAL_TEST__) {
    try {
      return localStorage.getItem('sb.visual.seasonalHome') === 'diwali' ? 'diwali' : null;
    } catch {
      return null;
    }
  }
  return SEASONAL_HOME;
}

export function seasonalHomeAt(now: Date): SeasonalHome | null {
  return resolveSeasonalHome(configuredSeason(), SEASONAL_HOME_ENDS, now);
}
