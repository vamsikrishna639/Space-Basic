import { describe, expect, it } from 'vitest';
import { areasFor, landingPath } from './areas';

describe('role-based landing', () => {
  it('one role, one app', () => {
    expect(landingPath(['student'], null)).toBe('/home');
    expect(landingPath(['warden'], null)).toBe('/warden');
    expect(landingPath(['institution_admin'], null)).toBe('/admin');
    expect(landingPath(['super_admin'], null)).toBe('/admin');
  });

  it('two roles: the chooser, until a choice is remembered on this device', () => {
    expect(areasFor(['warden', 'student'])).toEqual(['student', 'warden']);
    expect(landingPath(['student', 'warden'], null)).toBe('/choose');
    expect(landingPath(['student', 'warden'], 'warden')).toBe('/warden');
    expect(landingPath(['student', 'warden'], 'student')).toBe('/home');
  });

  it('a remembered area the user no longer has is ignored', () => {
    expect(landingPath(['student', 'warden'], 'admin')).toBe('/choose');
    expect(landingPath(['warden'], 'student')).toBe('/warden');
  });

  it('admin and super admin are the same area (no double entry)', () => {
    expect(areasFor(['institution_admin', 'super_admin'])).toEqual(['admin']);
    expect(landingPath(['institution_admin', 'super_admin'], null)).toBe('/admin');
  });

  it('a role without an app yet (mess staff) gets the "no app" page', () => {
    expect(areasFor(['mess_staff'])).toEqual([]);
    expect(landingPath(['mess_staff'], null)).toBe('/no-access');
    expect(landingPath(['mess_staff', 'warden'], null)).toBe('/warden');
  });
});
