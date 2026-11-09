import { IMPORT_MAX_ROWS } from './schemas/users';

// User CSV import, shared by the admin Users screen (in the browser) and the import script
// (server/src/scripts/import-users.ts), so both read a file exactly the same way. No dependency.

/**
 * Minimal RFC 4180 CSV parser: comma separator, double-quoted fields with "" escapes, CRLF or LF line ends, an
 * optional UTF-8 BOM. Each record keeps the line it started on for error messages.
 */
export interface CsvRecord { line: number; fields: string[] }

export class CsvError extends Error {}

export function parseCsv(text: string): CsvRecord[] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let line = 1;
  let recordLine = 1;
  let i = 0;
  let quoted = false;
  let fieldStarted = false;

  const endField = () => { fields.push(field); field = ''; fieldStarted = false; };
  const endRecord = () => {
    endField();
    if (!(fields.length === 1 && fields[0] === '')) records.push({ line: recordLine, fields }); // skip blank lines
    fields = [];
    recordLine = line;
  };

  while (i < s.length) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++;
        const next = s[i];
        if (next !== undefined && next !== ',' && next !== '\n' && next !== '\r') throw new CsvError(`line ${line}: unexpected character after a closing quote`);
        continue;
      }
      if (c === '\n') line++;
      field += c; i++;
      continue;
    }
    if (c === '"') {
      if (fieldStarted || field !== '') throw new CsvError(`line ${line}: a quote must start the field`);
      quoted = true; fieldStarted = true; i++;
      continue;
    }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r' || c === '\n') {
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
      line++;
      endRecord();
      continue;
    }
    field += c; fieldStarted = true; i++;
  }
  if (quoted) throw new CsvError(`line ${recordLine}: a quoted field is not closed`);
  if (field !== '' || fields.length) endRecord();
  return records;
}

/** Columns of a user CSV, in the template's order. Only fullName and roles are required (plus email or phone). */
export const CSV_COLUMNS = ['fullName', 'email', 'phone', 'roles', 'roomCode', 'password'] as const;

export interface CsvUserRow { line: number; row: Record<string, unknown> }

/** CSV records -> API rows (POST /users/import), keeping each row's CSV line number. Throws CsvError on a bad header. */
export function recordsToRows(records: CsvRecord[]): CsvUserRow[] {
  const [header, ...data] = records;
  if (!header) throw new CsvError('The CSV file is empty');
  const columns = header.fields.map((f) => f.trim());
  const unknown = columns.filter((c) => !(CSV_COLUMNS as readonly string[]).includes(c));
  if (unknown.length) throw new CsvError(`Unknown column(s): ${unknown.join(', ')}. Allowed: ${CSV_COLUMNS.join(', ')}`);
  for (const required of ['fullName', 'roles']) if (!columns.includes(required)) throw new CsvError(`Missing column: ${required}`);
  if (new Set(columns).size !== columns.length) throw new CsvError('A column appears twice in the header');

  return data.map((rec) => {
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      const value = (rec.fields[i] ?? '').trim();
      row[col] = col === 'roles' ? value.split('|').map((r) => r.trim()).filter(Boolean) : value;
    });
    return { line: rec.line, row };
  });
}

/** The API accepts JSON bodies up to 100 kB; batches stay under this. */
export const IMPORT_MAX_BATCH_BYTES = 90_000;

/** UTF-8 length of a string, without TextEncoder or Buffer (shared runs in Node and the browser). */
export function utf8Length(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Split rows into batches that respect both the row limit and the request-size limit. */
export function batches<T>(items: T[], maxRows = IMPORT_MAX_ROWS, maxBytes = IMPORT_MAX_BATCH_BYTES): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let bytes = 20;
  for (const item of items) {
    const size = utf8Length(JSON.stringify(item)) + 1;
    if (current.length && (current.length >= maxRows || bytes + size > maxBytes)) { out.push(current); current = []; bytes = 20; }
    current.push(item);
    bytes += size;
  }
  if (current.length) out.push(current);
  return out;
}
