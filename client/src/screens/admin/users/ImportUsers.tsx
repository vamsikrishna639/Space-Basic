import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { FileCsvIcon } from '@phosphor-icons/react/dist/csr/FileCsv';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { batches, CsvError } from '@spacebasic/shared';
import { ApiError } from '../../../api/client';
import { StaffLayout } from '../../staff/StaffLayout';
import { ADMIN_NAV } from '../../staff/StaffHomes';
import { importUsers } from './usersApi';
import { checkImport, CSV_TEMPLATE, IMPORT_MAX_FILE_BYTES, plural, type ImportRow } from './usersText';
import type { UsersFlash } from './UsersList';
import s from './AdminUsers.module.css';

// Admin > Users > Import CSV (FREE DESIGN; docs/not-from-reference.md). The file is read in the browser with the
// same parser and rules as the import script (shared/src/csv.ts), previewed, and the ready rows are sent to
// POST /users/import in batches. The server checks every row again (duplicates, full rooms) and reports skips.

interface Done { created: number; skipped: { line: number; reason: string }[] }

const cell = (v: unknown) => (Array.isArray(v) ? v.join(' | ') : typeof v === 'string' ? v : '');

export function ImportUsers() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(() => rows?.filter((r) => r.problem === null) ?? [], [rows]);
  const problems = (rows?.length ?? 0) - ready.length;
  const templateUrl = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`, []);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // choosing the same file again still fires
    if (!file) return;
    setRows(null); setDone(null); setError(null); setFileError(null);
    setFileName(file.name);
    if (file.size > IMPORT_MAX_FILE_BYTES) { setFileError('The file is larger than 1 MB. Split it into smaller files.'); return; }
    try {
      setRows(checkImport(await file.text()));
    } catch (err) {
      setFileError(err instanceof CsvError ? err.message : 'That file could not be read as CSV.');
    }
  }

  async function run() {
    if (!ready.length) return;
    setError(null);
    const parts = batches(ready.map((r) => r.row)).map((b) => b.length);
    const result: Done = { created: 0, skipped: [] };
    let offset = 0;
    try {
      for (const [i, size] of parts.entries()) {
        setProgress(parts.length > 1 ? `Importing… part ${i + 1} of ${parts.length}` : 'Importing…');
        const part = ready.slice(offset, offset + size);
        const res = await importUsers(part.map((r) => r.row));
        result.created += res.created;
        for (const skip of res.skipped) result.skipped.push({ line: part[skip.row - 1]!.line, reason: skip.reason });
        offset += size;
      }
      setDone(result);
    } catch (err) {
      // Earlier parts are already in; say how far it got.
      setDone(offset ? result : null);
      setError(`${err instanceof ApiError ? err.message : 'The import stopped.'}${offset ? ` Rows before line ${ready[offset]!.line} were imported.` : ''}`);
    } finally {
      setProgress(null);
    }
  }

  const reset = () => { setRows(null); setDone(null); setFileName(null); setError(null); setFileError(null); };

  return (
    <StaffLayout area="admin" nav={ADMIN_NAV}>
      <div className={s.head}>
        <div className={s.headLeft}>
          <Link to="/admin/users" className={s.back} aria-label="Back to Users">
            <CaretLeftIcon size={18} weight="bold" aria-hidden="true" />
          </Link>
          <h1>Import users</h1>
        </div>
      </div>

      <div className={s.form} style={{ maxWidth: 960 }}>
        {!done && (
          <section className={s.card} aria-labelledby="file-title">
            <h2 id="file-title">Choose a CSV file</h2>
            <p className={s.cardText}>One user per row, with a header row. Columns can be in any order:</p>
            <ul className={s.columns}>
              <li><code>fullName</code> required</li>
              <li><code>email</code> and <code>phone</code>: at least one of them</li>
              <li><code>roles</code> required: <code>student</code>, <code>warden</code> or <code>institution_admin</code>; separate two with <code>|</code></li>
              <li><code>roomCode</code> students only, for example <code>CS240</code>; leave it empty to accept them later</li>
              <li><code>password</code> a first password; leave it empty only if one-time codes are turned on for your college</li>
            </ul>
            <div className={s.fileRow}>
              <input ref={fileInput} id="csv-file" className={s.fileInput} type="file" accept=".csv,text/csv" onChange={(e) => void choose(e)} />
              <label htmlFor="csv-file" className={`${s.btn} ${s.primary}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}>
                <FileCsvIcon size={18} aria-hidden="true" />
                {fileName ? 'Choose another file' : 'Choose file'}
              </label>
              <a href={templateUrl} download="spacebasic-users-template.csv" className={`${s.btn} ${s.outline}`}>
                <DownloadSimpleIcon size={18} aria-hidden="true" />
                Download template
              </a>
              {fileName && <span className={s.muted} style={{ fontSize: 13 }}>{fileName}</span>}
            </div>
            {fileError && <p className={s.error} role="alert" style={{ margin: '14px 0 0' }}>{fileError}</p>}
          </section>
        )}

        {rows && !done && (
          <section className={s.card} aria-labelledby="check-title">
            <h2 id="check-title">Check the rows</h2>
            <p className={s.summary} aria-live="polite">
              <span className={s.pill}>{plural(rows.length, 'row')}</span>
              <span className={s.pill}>{ready.length} ready</span>
              {problems > 0 && <span className={`${s.pill} ${s.pillOff}`}>{problems} with problems</span>}
            </p>
            {problems > 0 && <p className={s.cardText}>Rows with problems are left out. Fix them in the file and import it again: rows already imported are skipped as "already in use".</p>}
            <div className={s.preview}>
              <table>
                <thead>
                  <tr><th scope="col">Line</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Mobile</th><th scope="col">Roles</th><th scope="col">Room</th><th scope="col">Check</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{cell(r.row.fullName)}</td>
                      <td>{cell(r.row.email)}</td>
                      <td>{cell(r.row.phone)}</td>
                      <td>{cell(r.row.roles)}</td>
                      <td>{cell(r.row.roomCode)}</td>
                      {r.problem ? <td className={s.problem}>{r.problem}</td> : <td className={s.ready}>Ready</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <p className={s.error} role="alert" style={{ margin: '14px 0 0' }}>{error}</p>}
            <div className={s.formFoot} style={{ marginTop: 14 }}>
              <button type="button" className={`${s.btn} ${s.primary} ${s.big}`} onClick={() => void run()} disabled={!ready.length || progress !== null}>
                {progress ?? (ready.length ? `Import ${plural(ready.length, 'user')}` : 'Nothing to import')}
              </button>
              <button type="button" className={`${s.btn} ${s.big}`} onClick={reset} disabled={progress !== null}>Cancel</button>
            </div>
          </section>
        )}

        {done && (
          <section className={s.card} aria-labelledby="done-title" role="status">
            <h2 id="done-title">Import finished</h2>
            <p className={s.notice} style={{ margin: '10px 0 14px' }}>
              <CheckCircleIcon size={20} weight="fill" aria-hidden="true" />
              Added {plural(done.created, 'user')}.{done.skipped.length + problems > 0 && ` Skipped ${done.skipped.length + problems}.`}
            </p>
            {error && <p className={s.error} role="alert">{error}</p>}
            {(done.skipped.length > 0 || problems > 0) && (
              <div className={s.preview} style={{ marginBottom: 14 }}>
                <table>
                  <thead><tr><th scope="col">Line</th><th scope="col">Name</th><th scope="col">Why it was skipped</th></tr></thead>
                  <tbody>
                    {[...(rows ?? []).filter((r) => r.problem).map((r) => ({ line: r.line, reason: r.problem! })), ...done.skipped]
                      .sort((a, b) => a.line - b.line)
                      .map((x) => (
                        <tr key={x.line}>
                          <td>{x.line}</td>
                          <td>{cell(rows?.find((r) => r.line === x.line)?.row.fullName)}</td>
                          <td className={s.problem}>{x.reason}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className={s.formFoot}>
              <button
                type="button"
                className={`${s.btn} ${s.primary} ${s.big}`}
                onClick={() => navigate('/admin/users', { state: { flash: `Imported ${plural(done.created, 'user')}.` } satisfies UsersFlash })}
              >
                Back to users
              </button>
              <button type="button" className={`${s.btn} ${s.big}`} onClick={reset}>Import another file</button>
            </div>
          </section>
        )}
      </div>
    </StaffLayout>
  );
}
