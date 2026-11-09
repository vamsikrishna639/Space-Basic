import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { displayPhone, type UserSummary } from '@spacebasic/shared';
import { ApiError } from '../../../api/client';
import { StaffLayout } from '../../staff/StaffLayout';
import { ADMIN_NAV } from '../../staff/StaffHomes';
import { RoomPicker } from './RoomPicker';
import { listUsers, updateUser } from './usersApi';
import { emptyListText, parseView, ROLE_LABEL, usersQuery, VIEWS, waitsForRoom, type UsersView } from './usersText';
import s from './AdminUsers.module.css';

// Admin > Users (FREE DESIGN; docs/not-from-reference.md). The view and the search live in the URL, so Back and a
// reload keep them. "Accept" on a student waiting for a room opens the room picker and places them in one.

export interface UsersFlash { flash?: string }

export function UsersList() {
  const [params, setParams] = useSearchParams();
  const view = parseView(params.get('view'));
  const q = params.get('q') ?? '';
  const location = useLocation();
  const navigate = useNavigate();

  const [typed, setTyped] = useState(q);
  const [items, setItems] = useState<UserSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>((location.state as UsersFlash | null)?.flash ?? null);
  const [accepting, setAccepting] = useState<UserSummary | null>(null);

  // A flash message from Add / Import shows once: clear it from history so a reload doesn't repeat it.
  useEffect(() => {
    if ((location.state as UsersFlash | null)?.flash) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);

  const setQuery = (nextView: UsersView, nextQ: string) => {
    const p = new URLSearchParams();
    if (nextView !== 'all') p.set('view', nextView);
    if (nextQ.trim()) p.set('q', nextQ.trim());
    setParams(p, { replace: true });
  };

  // Search as the admin types (250 ms after the last key).
  useEffect(() => {
    if (typed.trim() === q) return;
    const t = setTimeout(() => setQuery(view, typed), 250);
    return () => clearTimeout(t);
  }, [typed]);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    listUsers(usersQuery(view, q))
      .then((page) => { if (!cancelled) { setItems(page.items); setNext(page.nextCursor); } })
      .catch((err) => { if (!cancelled) { setItems([]); setError(err instanceof ApiError ? err.message : 'Could not load users.'); } });
    return () => { cancelled = true; };
  }, [view, q]);

  async function more() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await listUsers(usersQuery(view, q, next));
      setItems((list) => [...(list ?? []), ...page.items]);
      setNext(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load more users.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function accept(code: string) {
    const user = accepting!;
    const saved = await updateUser(user.id, { roomCode: code }); // throws: the picker shows the message
    setAccepting(null);
    setNotice(`${saved.fullName} is now in ${saved.room?.display ?? code}.`);
    // In "Waiting for a room" the student leaves the list; elsewhere the row shows the room.
    setItems((list) => (list ?? []).flatMap((u) => (u.id !== saved.id ? [u] : view === 'waiting' ? [] : [saved])));
  }

  return (
    <StaffLayout area="admin" nav={ADMIN_NAV}>
      <div className={s.head}>
        <h1>Users</h1>
        <div className={s.actions}>
          <Link to="/admin/users/import" className={`${s.btn} ${s.outline}`}>
            <UploadSimpleIcon size={18} aria-hidden="true" />
            Import CSV
          </Link>
          <Link to="/admin/users/new" className={`${s.btn} ${s.primary}`}>
            <PlusIcon size={18} weight="bold" aria-hidden="true" />
            Add user
          </Link>
        </div>
      </div>

      <div className={s.toolbar}>
        <div className={s.search}>
          <MagnifyingGlassIcon size={18} aria-hidden="true" />
          <input
            className={s.input}
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search by name, email, mobile or room"
            aria-label="Search users"
            maxLength={60}
          />
        </div>
        <div className={s.views} role="group" aria-label="Show">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" className={s.view} aria-pressed={view === v.key} onClick={() => setQuery(v.key, typed)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite">
        {notice && (
          <p className={s.notice}>
            <CheckCircleIcon size={20} weight="fill" aria-hidden="true" />
            {notice}
          </p>
        )}
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}

      <div className={s.tableCard}>
        {items === null ? (
          <p className={s.empty} aria-busy="true">Loading…</p>
        ) : items.length === 0 ? (
          <p className={s.empty}>{emptyListText(view, q)}</p>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className={s.colPhone}>Mobile</th>
                <th scope="col">Roles</th>
                <th scope="col">Room</th>
                <th scope="col"><span className="visually-hidden">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td className={s.colName}>
                    <span className={s.nameCell}>
                      <Link to={`/admin/users/${u.id}`} className={s.link}>{u.fullName}</Link>
                      <span className={s.sub}>{u.email ?? (u.phone ? displayPhone(u.phone) : '')}</span>
                    </span>
                  </td>
                  <td className={`${s.colPhone} ${s.muted}`}>{u.phone ? displayPhone(u.phone) : '—'}</td>
                  <td className={s.colRoles}>
                    <span className={s.pills}>
                      {u.roles.map((r) => <span key={r} className={s.pill}>{ROLE_LABEL[r]}</span>)}
                      {u.status === 'disabled' && <span className={`${s.pill} ${s.pillOff}`}>Disabled</span>}
                    </span>
                  </td>
                  <td className={s.colRoom}>
                    {u.room ? u.room.display : waitsForRoom(u) ? <span className={`${s.pill} ${s.pillWait}`}>Waiting for a room</span> : <span className={s.muted}>—</span>}
                  </td>
                  <td className={s.rowAction}>
                    {waitsForRoom(u) ? (
                      <button type="button" className={`${s.btn} ${s.small} ${s.primary}`} onClick={() => setAccepting(u)} aria-label={`Accept ${u.fullName} and assign a room`}>
                        Accept
                      </button>
                    ) : (
                      <Link to={`/admin/users/${u.id}`} className={`${s.btn} ${s.small}`} aria-label={`Edit ${u.fullName}`}>Edit</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {next && (
          <div className={s.more}>
            <button type="button" className={s.btn} onClick={() => void more()} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
          </div>
        )}
      </div>

      <RoomPicker
        open={accepting !== null}
        title={accepting ? `Accept ${accepting.fullName}` : 'Accept'}
        subtitle="Choose a room with a free bed. They see it on their profile at once."
        action="Assign"
        onPick={accept}
        onClose={() => setAccepting(null)}
      />
    </StaffLayout>
  );
}
