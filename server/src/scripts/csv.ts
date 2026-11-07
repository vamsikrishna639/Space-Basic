/**
 * Minimal RFC 4180 CSV parser (no dependency): comma separator, double-quoted fields with "" escapes,
 * CRLF or LF line ends, an optional UTF-8 BOM. Each record keeps the line it started on for error messages.
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
