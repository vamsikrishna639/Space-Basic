import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, CsvError } from './csv';
import { batches, recordsToRows } from './import-users';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines inside quotes, CRLF, a BOM and blank lines', () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""",\r\n\r\n"multi\nline",2,3\n';
    expect(parseCsv(text)).toEqual([
      { line: 1, fields: ['a', 'b', 'c'] },
      { line: 2, fields: ['x, y', 'say "hi"', ''] },
      { line: 4, fields: ['multi\nline', '2', '3'] },
    ]);
  });

  it('accepts a last line without a newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([{ line: 1, fields: ['a', 'b'] }, { line: 2, fields: ['1', '2'] }]);
  });

  it('rejects malformed quoting', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(CsvError);
    expect(() => parseCsv('a,"b"c\n')).toThrow(CsvError);
    expect(() => parseCsv('a,b"c"\n')).toThrow(CsvError);
  });
});

describe('recordsToRows', () => {
  it('maps the example file to API rows with CSV line numbers and split roles', () => {
    const csv = fs.readFileSync(path.join(__dirname, 'users.example.csv'), 'utf8');
    const rows = recordsToRows(parseCsv(csv));
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({
      line: 3,
      row: { fullName: 'Kiran, Das', email: 'kiran.das@example.com', phone: '', roles: ['student'], roomCode: 'CF101', password: 'Kiran@Pass2026' },
    });
  });

  it('splits "|" separated roles and refuses unknown, missing or repeated columns', () => {
    expect(recordsToRows(parseCsv('fullName,roles\nA B,warden|student\n'))[0]!.row.roles).toEqual(['warden', 'student']);
    expect(() => recordsToRows(parseCsv('fullName,roles,age\n'))).toThrow(/Unknown column/);
    expect(() => recordsToRows(parseCsv('fullName,email\n'))).toThrow(/Missing column: roles/);
    expect(() => recordsToRows(parseCsv('fullName,roles,roles\n'))).toThrow(/twice/);
  });
});

describe('batches', () => {
  it('respects both the row limit and the byte limit', () => {
    expect(batches([1, 2, 3, 4, 5], 2).map((b) => b.length)).toEqual([2, 2, 1]);
    const big = Array.from({ length: 10 }, () => 'x'.repeat(30));
    expect(batches(big, 500, 100).every((b) => Buffer.byteLength(JSON.stringify(b)) <= 100)).toBe(true);
  });
});
