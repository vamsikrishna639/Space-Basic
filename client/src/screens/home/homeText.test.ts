import { describe, expect, it } from 'vitest';
import { badgeText, greetingFor, greetingName, homeDate, isLongAppLabel } from './homeText';

describe('Home header text', () => {
  it('greets by local time', () => {
    expect(greetingFor(new Date(2026, 10, 3, 6, 0))).toBe('Good morning');
    expect(greetingFor(new Date(2026, 10, 3, 11, 59))).toBe('Good morning');
    expect(greetingFor(new Date(2026, 10, 3, 12, 0))).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 10, 3, 16, 59))).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 10, 3, 17, 20))).toBe('Good evening');
  });
  it('formats the date like the screenshot', () => {
    expect(homeDate(new Date(2026, 10, 3, 17, 20))).toBe('Tuesday 3 November');
  });
  it('shows the first name in upper case', () => {
    expect(greetingName('Arjun')).toBe('ARJUN');
  });
});

describe('tab badge and app labels', () => {
  it('hides 0 and caps at 99+', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
  it('treats only long single words as long labels', () => {
    expect(isLongAppLabel('Announcements')).toBe(true);
    expect(isLongAppLabel('Leave Manager')).toBe(false);
    expect(isLongAppLabel('Tickets')).toBe(false);
  });
});
