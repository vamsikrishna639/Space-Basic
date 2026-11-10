/**
 * Seasonal Home (decisions.md 2026-11-10). A temporary festive look for the student Home screen only; every other
 * screen is unaffected.
 *
 *   SEASONAL_HOME       'diwali' shows the Diwali header, lamps and greeting card (reference-ui/home-diwali-dark.png).
 *                       null shows the normal Home (reference-ui/04-home.png), exactly as before.
 *   SEASONAL_HOME_ENDS  'YYYY-MM-DD': the last day the seasonal look shows, by the phone's own date. From the next
 *                       day the normal Home shows without a new deploy. '' = no end date.
 */
export type SeasonalHome = 'diwali';

export const SEASONAL_HOME: SeasonalHome | null = 'diwali';
export const SEASONAL_HOME_ENDS: string = '2026-11-20';
