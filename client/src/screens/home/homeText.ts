// Home header text (SPEC.md screen 4): "Good evening, {FIRST NAME}" by the phone's local time, and the date as
// "Tuesday 3 November".

export function greetingFor(date: Date): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
export function homeDate(date: Date): string {
  return dateFormat.format(date).replace(/,/g, '');
}

/** The first name as the screenshot shows it: upper case. */
export function greetingName(firstName: string): string {
  return firstName.toLocaleUpperCase('en-IN');
}

/** Tab bar badge: hidden at 0, capped at "99+". */
export function badgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/** One word that can't fit an Apps column gets the smaller size and may break inside the word (as in the
 * screenshot's "Announceme/nts"); labels with spaces wrap between words at the normal size. */
export function isLongAppLabel(title: string): boolean {
  return !title.includes(' ') && title.length > 10;
}
