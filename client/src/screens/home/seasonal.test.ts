import { describe, expect, it } from 'vitest';
import { SEASONAL_HOME, SEASONAL_HOME_ENDS } from '../../config/seasonal';
import { isValidEndDate, localDay, resolveSeasonalHome, seasonalHomeAt } from './seasonal';

describe('seasonal Home switch', () => {
  it('null always shows the normal Home', () => {
    expect(resolveSeasonalHome(null, '', new Date(2026, 10, 10))).toBeNull();
    expect(resolveSeasonalHome(null, '2026-12-31', new Date(2026, 10, 10))).toBeNull();
  });
  it('no end date keeps the season on', () => {
    expect(resolveSeasonalHome('diwali', '', new Date(2030, 0, 1))).toBe('diwali');
  });
  it('shows through the whole end day (phone date), then the normal Home', () => {
    expect(resolveSeasonalHome('diwali', '2026-11-15', new Date(2026, 10, 15, 0, 0))).toBe('diwali');
    expect(resolveSeasonalHome('diwali', '2026-11-15', new Date(2026, 10, 15, 23, 59, 59))).toBe('diwali');
    expect(resolveSeasonalHome('diwali', '2026-11-15', new Date(2026, 10, 16, 0, 0))).toBeNull();
    expect(resolveSeasonalHome('diwali', '2026-11-15', new Date(2027, 0, 1))).toBeNull();
  });
  it('an end date that is not a real YYYY-MM-DD turns the season off', () => {
    for (const bad of ['2026-11-31', '15-11-2026', '2026/11/15', '2026-1-5', 'soon']) {
      expect(isValidEndDate(bad)).toBe(false);
      expect(resolveSeasonalHome('diwali', bad, new Date(2026, 10, 10))).toBeNull();
    }
  });
  it('the configured end date is valid', () => {
    expect(isValidEndDate(SEASONAL_HOME_ENDS)).toBe(true);
  });
  it('formats the local day', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
  it('outside visual-test builds, follows the constant', () => {
    const d = new Date(2026, 10, 10, 20, 59);
    expect(seasonalHomeAt(d)).toBe(resolveSeasonalHome(SEASONAL_HOME, SEASONAL_HOME_ENDS, d));
  });
});
