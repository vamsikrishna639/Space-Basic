// Notifications list text (reference-ui/05-notifications.png): date headings "25 OCT 2026" and times "07:24 PM",
// both in the phone's local time, like Home's greeting and date (decisions.md).
import type { NotificationItem } from '@spacebasic/shared';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "25 OCT 2026", "09 OCT 2026" (two-digit day, as in the screenshot). */
export function dateHeading(d: Date): string {
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "07:24 PM", "12:05 AM" (two-digit 12-hour clock). */
export function timeLabel(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${pad(h)}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export interface DayGroup {
  key: string;
  heading: string;
  items: NotificationItem[];
}

/** Consecutive notifications of the same local day share one heading; the API sends them newest first. */
export function groupByDay(items: NotificationItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, heading: dateHeading(d), items: [item] });
  }
  return groups;
}

/** Where a row leads. Modules without their own screen yet open ComingSoon through /m/:module. */
export function linkPath(item: NotificationItem): string | null {
  return item.link ? `/m/${item.link.module}` : null;
}
