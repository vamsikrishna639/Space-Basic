import { describe, expect, it } from 'vitest';
import { addRoomsBody, codeRanges, floorRangeText, floorStatsText, minBeds, removeRoomsBody, takenText, totals, type AddRoomsForm } from './hostelText';

const cf = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `CF${from + i}`);

describe('codeRanges', () => {
  it('joins consecutive rooms into ranges', () => {
    expect(codeRanges(cf(101, 180))).toBe('CF101–CF180');
    expect(codeRanges(['CF101', 'CF102', 'CF105', 'CS201'])).toBe('CF101–CF102, CF105, CS201');
    expect(codeRanges([])).toBe('');
  });
  it('counts the rest after a few groups', () => {
    expect(codeRanges(['CF101', 'CF103', 'CF105', 'CF107', 'CF109', 'CF110'], 2)).toBe('CF101, CF103 and 4 more');
  });
});

describe('floor texts', () => {
  const floor = { code: 'CF', roomCount: 80, roomNumberMin: 101, roomNumberMax: 180, beds: 240, occupied: 3 };
  it('range and stats', () => {
    expect(floorRangeText(floor)).toBe('CF101–CF180');
    expect(floorRangeText({ ...floor, roomCount: 1, roomNumberMax: 101 })).toBe('CF101');
    expect(floorRangeText({ ...floor, roomCount: 0 })).toBe('No rooms yet');
    expect(floorStatsText(floor)).toBe('80 rooms · 240 beds · 3 taken');
  });
  it('totals across blocks', () => {
    const f = { ...floor, name: 'First floor', order: 1, bedsPerRoom: 3 };
    expect(totals([{ hostel: { name: 'West', code: 'W', order: 1 }, floors: [f, { ...f, code: 'CS', occupied: 1 }] }])).toEqual({ rooms: 160, beds: 480, occupied: 4 });
  });
  it('room tiles', () => {
    expect(takenText({ beds: 3, occupants: 0 })).toBe('3 beds, all free');
    expect(takenText({ beds: 3, occupants: 1 })).toBe('1 of 3 taken');
    expect(takenText({ beds: 3, occupants: 3 })).toBe('Full (3 of 3)');
    expect(minBeds({ occupants: 0 })).toBe(1);
    expect(minBeds({ occupants: 2 })).toBe(2);
  });
});

describe('Add rooms form (checked with the shared schema)', () => {
  const base: AddRoomsForm = { hostelCode: 'W', floorCode: '', newCode: 'cf', newName: 'First floor', from: '101', to: '180', beds: '3' };
  it('builds the body for a new floor', () => {
    expect(addRoomsBody(base, true)).toEqual({ body: { hostelCode: 'W', floorCode: 'cf', floorName: 'First floor', from: 101, to: 180, beds: 3, dryRun: true } });
  });
  it('an existing floor needs no name', () => {
    expect(addRoomsBody({ ...base, floorCode: 'CF', newName: '', newCode: '' }, false)).toEqual({ body: { hostelCode: 'W', floorCode: 'CF', floorName: undefined, from: 101, to: 180, beds: 3, dryRun: false } });
  });
  it('reports problems on the fields the admin sees', () => {
    const errors = (f: Partial<AddRoomsForm>) => ('errors' in addRoomsBody({ ...base, ...f }, true) ? (addRoomsBody({ ...base, ...f }, true) as { errors: Record<string, string> }).errors : {});
    expect(errors({ to: '100' }).to).toMatch(/at least the first/);
    expect(errors({ from: '1', to: '999' }).to).toMatch(/At most 500/);
    expect(errors({ beds: '0' }).beds).toBeDefined();
    expect(errors({ beds: '13' }).beds).toBeDefined();
    expect(errors({ newCode: 'C' }).newCode).toBeDefined();
    expect(errors({ newName: ' ' }).newName).toMatch(/Name the new floor/);
    expect(errors({ from: '' }).from).toBeDefined();
  });
});

describe('Remove rooms form', () => {
  it('builds the body or reports the fields', () => {
    expect(removeRoomsBody('CF', { from: '171', to: '180' }, true)).toEqual({ body: { floorCode: 'CF', from: 171, to: 180, dryRun: true } });
    expect('errors' in removeRoomsBody('CF', { from: '180', to: '171' }, true)).toBe(true);
  });
});
