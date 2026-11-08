import { describe, expect, it } from 'vitest';
import type { NotificationItem } from '@spacebasic/shared';
import { dateHeading, groupByDay, linkPath, timeLabel } from './notificationsText';

// Dates are built in local time, the way the screen shows them.
const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min);
const item = (id: string, when: Date, extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id, type: 'leave_submitted', title: 'Leave Request Submitted', body: null, link: { module: 'leave', refId: null },
  readAt: null, createdAt: when.toISOString(), ...extra,
});

describe('notification text', () => {
  it('formats day headings like the screenshot', () => {
    expect(dateHeading(at(2026, 10, 25, 19, 24))).toBe('25 OCT 2026');
    expect(dateHeading(at(2026, 10, 9, 8, 0))).toBe('09 OCT 2026');
    expect(dateHeading(at(2027, 1, 1, 0, 0))).toBe('01 JAN 2027');
  });
  it('formats times on a two-digit 12-hour clock', () => {
    expect(timeLabel(at(2026, 10, 25, 19, 24))).toBe('07:24 PM');
    expect(timeLabel(at(2026, 10, 16, 15, 25))).toBe('03:25 PM');
    expect(timeLabel(at(2026, 10, 16, 0, 5))).toBe('12:05 AM');
    expect(timeLabel(at(2026, 10, 16, 12, 0))).toBe('12:00 PM');
    expect(timeLabel(at(2026, 10, 16, 9, 7))).toBe('09:07 AM');
  });
  it('groups consecutive items of the same local day', () => {
    const groups = groupByDay([
      item('a', at(2026, 10, 25, 19, 24)),
      item('b', at(2026, 10, 16, 15, 25)),
      item('c', at(2026, 10, 16, 15, 16)),
      item('d', at(2026, 10, 16, 0, 1)),
      item('e', at(2026, 10, 15, 23, 59)),
    ]);
    expect(groups.map((g) => [g.heading, g.items.map((i) => i.id).join('')])).toEqual([
      ['25 OCT 2026', 'a'], ['16 OCT 2026', 'bcd'], ['15 OCT 2026', 'e'],
    ]);
    expect(groupByDay([])).toEqual([]);
  });
  it('deep-links to the module screen', () => {
    expect(linkPath(item('a', at(2026, 10, 25, 1, 1)))).toBe('/m/leave');
    expect(linkPath(item('a', at(2026, 10, 25, 1, 1), { link: null }))).toBeNull();
  });
});
