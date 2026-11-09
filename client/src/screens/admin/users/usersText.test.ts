import { describe, expect, it } from 'vitest';
import { CsvError, displayPhone, type UserSummary } from '@spacebasic/shared';
import {
  checkImport, CSV_TEMPLATE, editChanges, EMPTY_FORM, formErrors, formFrom, freeBedsText, parseView, roomSearchText,
  toCreateBody, usersQuery, waitsForRoom,
} from './usersText';

const student: UserSummary = {
  id: '64b7f0c2a1b2c3d4e5f60718', fullName: 'Arjun Kumar Rao', email: 'arjun.rao@example.com', phone: '+919000000001',
  roles: ['student'], status: 'active', room: { code: 'CS240', display: 'West CS240' }, hasAvatar: false, hasPassword: true,
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('list views', () => {
  it('maps each view to the GET /users filters; "Waiting for a room" is active students without one', () => {
    expect(usersQuery('waiting', '')).toBe('limit=25&role=student&room=none&status=active');
    expect(usersQuery('disabled', ' cs2 ', 'abc')).toBe('limit=25&status=disabled&q=cs2&cursor=abc');
    expect(usersQuery('admins', '')).toBe('limit=25&role=institution_admin');
    expect(usersQuery('all', '')).toBe('limit=25');
  });

  it('falls back to "all" for an unknown view in the URL', () => {
    expect(parseView('waiting')).toBe('waiting');
    expect(parseView('nope')).toBe('all');
    expect(parseView(null)).toBe('all');
  });

  it('only active students without a room are waiting', () => {
    expect(waitsForRoom({ ...student, room: null })).toBe(true);
    expect(waitsForRoom(student)).toBe(false);
    expect(waitsForRoom({ ...student, room: null, status: 'disabled' })).toBe(false);
    expect(waitsForRoom({ ...student, room: null, roles: ['warden'] })).toBe(false);
  });
});

describe('rooms', () => {
  it('describes free beds', () => {
    expect(freeBedsText({ beds: 3, occupants: 2 })).toBe('1 of 3 beds free');
    expect(freeBedsText({ beds: 1, occupants: 0 })).toBe('1 of 1 bed free');
  });

  it('keeps the room search to the start of a room code', () => {
    expect(roomSearchText('cs2')).toBe('CS2');
    expect(roomSearchText('CS 24-0')).toBe('CS240');
    expect(roomSearchText('CS2401')).toBe('CS240');
    expect(roomSearchText('.*$')).toBe('');
  });
});

describe('add / edit form', () => {
  it('checks with the server schema: a name, an email or phone, a room only for students, no identity password', () => {
    expect(formErrors(EMPTY_FORM, { withPassword: true })).toEqual({ fullName: 'Enter the full name', email: 'Give an email or a mobile number' });
    const warden = { ...EMPTY_FORM, fullName: 'Meera Nair', email: 'meera@example.com', roles: ['warden' as const], roomCode: 'CS240', password: 'meera@example.com' };
    // A warden's room is dropped before sending (the Room card is hidden), so only the password is wrong.
    expect(formErrors(warden, { withPassword: true })).toEqual({ password: 'The password must not be the email or mobile number' });
    expect(formErrors({ ...warden, password: '' }, { withPassword: true })).toEqual({});
    expect(formErrors({ ...warden, roles: [] }, { withPassword: false })).toEqual({ roles: 'Choose at least one role' });
    expect(toCreateBody({ ...warden, password: 'Secret@2026' })).toMatchObject({ roomCode: '', password: 'Secret@2026' });
  });

  it('an untouched form changes nothing', () => {
    expect(editChanges(student, formFrom(student, displayPhone))).toEqual({ roles: null, fields: null });
  });

  it('sends only what changed; a cleared email is null; the phone is compared normalised', () => {
    const form = { ...formFrom(student, displayPhone), fullName: 'Arjun  K Rao', email: '', phone: '90000 00001', roomCode: 'CT301' };
    expect(editChanges(student, form)).toEqual({ roles: null, fields: { fullName: 'Arjun  K Rao', email: null, roomCode: 'CT301' } });
    expect(editChanges(student, { ...formFrom(student, displayPhone), phone: '' }).fields).toEqual({ phone: null });
    expect(editChanges(student, { ...formFrom(student, displayPhone), phone: '12' }).fields).toEqual({ phone: '12' });
  });

  it('roles go separately, and a user who stops being a student does not send a room', () => {
    const form = { ...formFrom(student, displayPhone), roles: ['warden' as const], roomCode: null };
    expect(editChanges(student, form)).toEqual({ roles: ['warden'], fields: null });
    const both = { ...formFrom(student, displayPhone), roles: ['student' as const, 'warden' as const] };
    expect(editChanges(student, both)).toEqual({ roles: ['student', 'warden'], fields: null });
  });
});

describe('CSV import check', () => {
  it('the template is ready to import', () => {
    expect(checkImport(CSV_TEMPLATE).map((r) => r.problem)).toEqual([null, null]);
  });

  it('reports each row\'s first problem with its line, and the same person twice', () => {
    const csv = [
      'fullName,email,phone,roles,roomCode,password',
      'Good Student,good@example.com,,student,CS240,',
      ',nobody@example.com,,student,,',
      'Mess Person,mess@example.com,,mess_staff,,',
      'Room Warden,warden@example.com,,warden,CS240,',
      'Good Again,GOOD@example.com,,student,,',
      'Phone Twice,,9000000013,student,,',
      'Phone Again,,+91 90000 00013,warden,,',
    ].join('\n');
    expect(checkImport(csv).map((r) => [r.line, r.problem])).toEqual([
      [2, null],
      [3, 'Name: Enter the full name'],
      [4, 'Roles: Unknown role'],
      [5, 'Room: Only students have a room'],
      [6, 'Same email as line 2'],
      [7, null],
      [8, 'Same mobile number as line 7'],
    ]);
  });

  it('refuses files it cannot read', () => {
    expect(() => checkImport('fullName,roles\n')).toThrow(CsvError);
    expect(() => checkImport('name,roles\nA,student\n')).toThrow(/Unknown column/);
    expect(() => checkImport('fullName,roles\n"A,student\n')).toThrow(CsvError);
    expect(() => checkImport('')).toThrow(CsvError);
  });
});
