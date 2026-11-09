import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import type { RoomSummary } from '@spacebasic/shared';
import { ApiError } from '../../../api/client';
import { freeRooms, hostelStructure } from './usersApi';
import { freeBedsText, roomSearchText } from './usersText';
import s from './AdminUsers.module.css';

/** A native <dialog> opened with showModal() while `open` is true (top layer, inert page, Escape closes). */
export function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return ref;
}

export const errorText = (err: unknown) => (err instanceof ApiError ? err.fields?.roomCode ?? err.message : 'Something went wrong. Please try again.');

/** Bed marks: filled = taken, outlined = free. */
function Beds({ room }: { room: RoomSummary }) {
  return (
    <span className={s.beds} aria-hidden="true">
      {Array.from({ length: room.beds }, (_, i) => <span key={i} className={i < room.occupants ? s.bed : `${s.bed} ${s.bedFree}`} />)}
    </span>
  );
}

/**
 * Choose a room with a free bed (GET /hostel/rooms?free=true). Only rooms with a free bed are listed, but the
 * server checks again when the choice is saved: if the bed went in the meantime, `onPick` throws and the message
 * shows here, with the list refreshed.
 */
export function RoomPicker({ open, title, subtitle, current, action, onPick, onClose }: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  /** The user's room now, which isn't offered again. */
  current?: string | null;
  action: string;
  onPick: (code: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const dialog = useModal(open);
  const id = useId();
  const [floors, setFloors] = useState<{ code: string; label: string }[]>([]);
  /** No rooms at all yet (Admin > Hostel creates them): a different empty message. */
  const [noRooms, setNoRooms] = useState(false);
  const [floor, setFloor] = useState('');
  const [q, setQ] = useState('');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    setChosen(null); setError(null); setQ(''); setFloor(''); setNoRooms(false);
    // Fetched on every open (small): rooms added in Admin > Hostel show up without a reload.
    hostelStructure()
      .then((list) => {
        const floorsWithRooms = list.flatMap((h) => h.floors.filter((f) => f.roomCount > 0).map((f) => ({
          code: f.code, label: list.length > 1 ? `${h.hostel.name} · ${f.name}` : f.name,
        })));
        setFloors(floorsWithRooms);
        setNoRooms(floorsWithRooms.length === 0);
      })
      .catch(() => setFloors([]));
  }, [open]);

  // The list follows the floor and the search (debounced while typing).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      freeRooms({ floor: floor || undefined, q: q || undefined })
        .then((page) => { if (!cancelled) { setRooms(page.items); setNext(page.nextCursor); } })
        .catch((err) => { if (!cancelled) { setRooms([]); setNext(null); setError(errorText(err)); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, q ? 200 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, floor, q, reload]);

  async function more() {
    if (!next) return;
    setLoading(true);
    try {
      const page = await freeRooms({ floor: floor || undefined, q: q || undefined, cursor: next });
      setRooms((r) => [...r, ...page.items]);
      setNext(page.nextCursor);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await onPick(chosen);
    } catch (err) {
      setError(errorText(err));
      setChosen(null);
      setReload((n) => n + 1); // the bed may have gone: show the rooms as they are now
    } finally {
      setBusy(false);
    }
  }

  const shown = rooms.filter((r) => r.code !== current);
  return (
    <dialog ref={dialog} className={s.dialog} aria-labelledby={`${id}-title`} onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit} style={{ display: 'contents' }}>
        <div className={s.dialogHead}>
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close">
            <XIcon size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <div className={s.dialogBody}>
          <div className={s.search}>
            <MagnifyingGlassIcon size={18} aria-hidden="true" />
            <input
              className={s.input}
              type="search"
              value={q}
              onChange={(e) => setQ(roomSearchText(e.target.value))}
              placeholder="Room code, e.g. CS2"
              aria-label="Search rooms by code"
              autoComplete="off"
            />
          </div>
          {floors.length > 1 && (
            <div className={s.floorChips} role="group" aria-label="Floor">
              {[{ code: '', label: 'All floors' }, ...floors].map((f) => (
                <button key={f.code} type="button" className={s.view} aria-pressed={floor === f.code} onClick={() => setFloor(f.code)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {error && <p className={s.error} role="alert">{error}</p>}
          <fieldset className={s.roomList} aria-label="Rooms with a free bed" aria-busy={loading}>
            {shown.map((r) => (
              <label key={r.code} className={s.roomOption}>
                <input type="radio" name={`${id}-room`} value={r.code} checked={chosen === r.code} onChange={() => setChosen(r.code)} />
                <span className={s.roomCode}>{r.code}</span>
                <Beds room={r} />
                <span className={s.roomFree}>{freeBedsText(r)}</span>
              </label>
            ))}
            {!loading && shown.length === 0 && (
              <p className={s.empty} style={{ gridColumn: '1 / -1' }}>
                {noRooms ? <>There are no rooms yet. Create them in <Link to="/admin/hostel" className={s.link}>Hostel</Link>.</>
                  : q ? `No room starting with ${q} has a free bed.` : 'No room has a free bed.'}
              </p>
            )}
          </fieldset>
          {next && (
            <button type="button" className={`${s.btn} ${s.small}`} onClick={() => void more()} disabled={loading} style={{ alignSelf: 'center' }}>
              More rooms
            </button>
          )}
        </div>
        <div className={s.dialogFoot}>
          <button type="button" className={s.btn} onClick={onClose}>Cancel</button>
          <button type="submit" className={`${s.btn} ${s.primary}`} disabled={!chosen || busy}>
            {busy ? 'Saving…' : chosen ? `${action} ${chosen}` : action}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Plain confirm dialog (disable a user). */
export function ConfirmDialog({ open, title, children, confirm, danger, busy, onConfirm, onClose }: {
  open: boolean; title: string; children: ReactNode; confirm: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  const dialog = useModal(open);
  const id = useId();
  return (
    <dialog ref={dialog} className={`${s.dialog} ${s.confirm}`} aria-labelledby={`${id}-title`} onClose={onClose} onCancel={onClose}>
      <div className={s.dialogHead}>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      <div className={s.dialogBody}>{children}</div>
      <div className={s.dialogFoot}>
        <button type="button" className={s.btn} onClick={onClose}>Cancel</button>
        <button type="button" className={`${s.btn} ${danger ? s.dangerBtn : s.primary}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'Saving…' : confirm}
        </button>
      </div>
    </dialog>
  );
}
