import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { MinusCircleIcon } from '@phosphor-icons/react/dist/csr/MinusCircle';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import {
  createHostelBodySchema, updateRoomBodySchema,
  type CreateRoomRangeResult, type DeleteRoomRangeResult, type FloorSummary, type HostelStructure, type RoomBlocker, type RoomSummary,
} from '@spacebasic/shared';
import { ApiError } from '../../../api/client';
import { StaffLayout } from '../../staff/StaffLayout';
import { ADMIN_NAV } from '../../staff/StaffHomes';
import { ConfirmDialog, useModal } from '../users/RoomPicker';
import {
  createBlock, createRoomRange, deleteFloor, deleteRoom, deleteRoomRange, hostelStructure, roomsPage, setRoomBeds,
} from './hostelApi';
import {
  addRoomsBody, codeRanges, floorRangeText, floorStatsText, minBeds, plural, removeRoomsBody, roomSearchText, takenText, totals,
  type AddRoomsForm, type RemoveRoomsForm,
} from './hostelText';
import u from '../users/AdminUsers.module.css';
import s from './Hostel.module.css';

// Admin > Hostel (FREE DESIGN; docs/not-from-reference.md). Blocks, floors and rooms: rooms are added by number
// range with a preview, removed one at a time or by range (never while someone is assigned), and each room's beds
// can change (never below the beds taken). The floor and the search live in the URL.

const message = (err: unknown, fallback = 'Something went wrong. Please try again.') => (err instanceof ApiError ? err.message : fallback);
const fieldErrors = (err: unknown) => (err instanceof ApiError ? err.fields ?? {} : {});

interface FloorRef { hostel: HostelStructure['hostel']; floor: FloorSummary }

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={u.label}>{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className={u.fieldError}>{error}</p> : hint ? <p className={u.hint}>{hint}</p> : null}
    </div>
  );
}

const inputProps = (id: string, error?: string) => ({
  id, className: u.input, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined,
});

function DialogFrame({ open, title, subtitle, onClose, onSubmit, foot, children, wide }: {
  open: boolean; title: string; subtitle?: ReactNode; onClose: () => void; onSubmit: (e: FormEvent) => void;
  foot: ReactNode; children: ReactNode; wide?: boolean;
}) {
  const dialog = useModal(open);
  const id = useId();
  return (
    <dialog ref={dialog} className={wide ? u.dialog : `${u.dialog} ${u.confirm}`} aria-labelledby={`${id}-title`} onClose={onClose} onCancel={onClose}>
      <form onSubmit={onSubmit} style={{ display: 'contents' }} noValidate>
        <div className={u.dialogHead}>
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className={u.close} onClick={onClose} aria-label="Close">
            <XIcon size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <div className={u.dialogBody} style={{ overflowY: 'auto' }}>{children}</div>
        <div className={u.dialogFoot}>{foot}</div>
      </form>
    </dialog>
  );
}

/** Who must move before rooms can go, with links to their pages. */
function BlockedList({ blocked }: { blocked: RoomBlocker[] }) {
  return (
    <div className={u.error} role="alert" style={{ margin: 0 }}>
      {blocked.length === 1 ? `Room ${blocked[0]!.code} has someone assigned.` : `${blocked.length} rooms have people assigned.`} Move them to another room first (open their page, then Change room):
      <ul className={s.blocked}>
        {blocked.map((b) => (
          <li key={b.code}>
            <strong>{b.code}</strong>
            {b.users.map((x, i) => (
              <span key={x.id}>
                <Link to={`/admin/users/${x.id}`} className={u.link} style={{ color: 'inherit' }}>{x.fullName}</Link>
                {x.status === 'disabled' && ' (disabled)'}
                {i < b.users.length - 1 && ','}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Add block -------------------------------------------------------------------------------------------

function AddBlockDialog({ open, onDone, onClose }: { open: boolean; onDone: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(''); setCode(''); setErrors({}); } }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = createHostelBodySchema.safeParse({ name, code });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      const made = await createBlock({ name: parsed.data.name, code: parsed.data.code });
      onDone(made.name);
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: message(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame open={open} title="Add a block" subtitle="A building, for example West. Its floors and rooms come next." onClose={onClose} onSubmit={submit}
      foot={<><button type="button" className={u.btn} onClick={onClose}>Cancel</button><button type="submit" className={`${u.btn} ${u.primary}`} disabled={busy}>{busy ? 'Saving…' : 'Add block'}</button></>}>
      <Field id="b-name" label="Name" error={errors.name}>
        <input {...inputProps('b-name', errors.name)} value={name} onChange={(e) => setName(e.target.value)} placeholder="West" maxLength={60} autoComplete="off" />
      </Field>
      <Field id="b-code" label="Short code" error={errors.code} hint="1 to 6 letters or digits, for example W. Not shown to students.">
        <input {...inputProps('b-code', errors.code)} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="W" maxLength={6} autoComplete="off" />
      </Field>
      {errors.form && !errors.name && !errors.code && <p className={u.error} role="alert" style={{ margin: 0 }}>{errors.form}</p>}
    </DialogFrame>
  );
}

// ---- Add rooms (range, with a preview) ---------------------------------------------------------------------

function AddRoomsDialog({ open, structure, preset, onDone, onClose }: {
  open: boolean; structure: HostelStructure[]; preset: FloorRef | null; onDone: (r: CreateRoomRangeResult) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<AddRoomsForm>({ hostelCode: '', floorCode: '', newCode: '', newName: '', from: '', to: '', beds: '3' });
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState<CreateRoomRangeResult | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const hostelCode = preset?.hostel.code ?? structure[0]?.hostel.code ?? '';
    const f = preset?.floor;
    setForm({
      hostelCode, floorCode: f?.code ?? '', newCode: '', newName: '',
      from: f && f.roomCount ? String(f.roomNumberMax + 1) : '', to: '', beds: String(f?.bedsPerRoom ?? 3),
    });
    setTried(false); setPreview(null); setServerErrors({}); setFormError(null);
  }, [open]);

  const built = addRoomsBody(form, true);
  const localErrors = 'errors' in built ? built.errors : {};
  // Before the first Create, only fields that have something in them show their problem.
  const shown = (field: keyof AddRoomsForm | 'hostelCode') =>
    serverErrors[field] ?? (tried || (field in form && String(form[field as keyof AddRoomsForm]).trim() !== '') ? localErrors[field] : undefined);

  // The preview: the server's dry run, 350 ms after the last change, once the form is complete.
  const key = JSON.stringify(form);
  useEffect(() => {
    if (!open) return;
    setServerErrors({}); setFormError(null);
    if ('errors' in built) { setPreview(null); return; }
    let cancelled = false;
    setChecking(true);
    const t = setTimeout(() => {
      createRoomRange(built.body)
        .then((r) => { if (!cancelled) setPreview(r); })
        .catch((err) => {
          if (cancelled) return;
          setPreview(null);
          const f = fieldErrors(err);
          setServerErrors({ ...f, ...(f.floorCode && form.floorCode === '' ? { newCode: f.floorCode } : {}), ...(f.floorName ? { newName: f.floorName } : {}) });
          if (!Object.keys(f).length) setFormError(message(err));
        })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); setChecking(false); };
  }, [open, key]);

  const set = (k: keyof AddRoomsForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const block = structure.find((h) => h.hostel.code === form.hostelCode);
  const floors = block?.floors ?? [];
  const chosenFloor = floors.find((f) => f.code === form.floorCode);
  const prefix = form.floorCode || form.newCode || 'CF';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    const real = addRoomsBody(form, false);
    if ('errors' in real || !preview || !preview.created.length) return;
    setBusy(true);
    try {
      onDone(await createRoomRange(real.body));
    } catch (err) {
      const f = fieldErrors(err);
      setServerErrors(f);
      setFormError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const count = preview?.created.length ?? 0;
  return (
    <DialogFrame open={open} wide title="Add rooms" subtitle="Rooms are numbered from the floor's prefix, for example CF101. Rooms that already exist are skipped." onClose={onClose} onSubmit={submit}
      foot={<>
        <button type="button" className={u.btn} onClick={onClose}>Cancel</button>
        <button type="submit" className={`${u.btn} ${u.primary}`} disabled={busy || checking || !count}>
          {busy ? 'Creating…' : count ? `Create ${plural(count, 'room')}` : 'Create rooms'}
        </button>
      </>}>
      {structure.length > 1 && (
        <Field id="r-block" label="Block">
          <select {...inputProps('r-block')} className={`${u.input} ${s.select}`} value={form.hostelCode} onChange={(e) => setForm((f) => ({ ...f, hostelCode: e.target.value, floorCode: '' }))}>
            {structure.map((h) => <option key={h.hostel.code} value={h.hostel.code}>{h.hostel.name}</option>)}
          </select>
        </Field>
      )}
      <Field id="r-floor" label="Floor">
        <select {...inputProps('r-floor')} className={`${u.input} ${s.select}`} value={form.floorCode} onChange={(e) => {
          const f = floors.find((x) => x.code === e.target.value);
          setForm((x) => ({ ...x, floorCode: e.target.value, from: f && f.roomCount ? String(f.roomNumberMax + 1) : '', to: '', beds: String(f?.bedsPerRoom ?? 3) }));
        }}>
          {floors.map((f) => <option key={f.code} value={f.code}>{f.name} ({f.code}) · {floorRangeText(f)}</option>)}
          <option value="">New floor…</option>
        </select>
      </Field>
      {form.floorCode === '' && (
        <div className={u.grid2}>
          <Field id="r-name" label="Floor name" error={shown('newName')}>
            <input {...inputProps('r-name', shown('newName'))} value={form.newName} onChange={(e) => set('newName', e.target.value)} placeholder="First floor" maxLength={60} autoComplete="off" />
          </Field>
          <Field id="r-code" label="Room prefix" error={shown('newCode')} hint="Two letters, for example CF.">
            <input {...inputProps('r-code', shown('newCode'))} value={form.newCode} onChange={(e) => set('newCode', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} placeholder="CF" maxLength={2} autoComplete="off" />
          </Field>
        </div>
      )}
      <div className={s.grid3}>
        <Field id="r-from" label="First number" error={shown('from')}>
          <input {...inputProps('r-from', shown('from'))} inputMode="numeric" value={form.from} onChange={(e) => set('from', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="101" autoComplete="off" />
        </Field>
        <Field id="r-to" label="Last number" error={shown('to')}>
          <input {...inputProps('r-to', shown('to'))} inputMode="numeric" value={form.to} onChange={(e) => set('to', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="180" autoComplete="off" />
        </Field>
        <Field id="r-beds" label="Beds per room" error={shown('beds')}>
          <input {...inputProps('r-beds', shown('beds'))} inputMode="numeric" value={form.beds} onChange={(e) => set('beds', e.target.value.replace(/\D/g, '').slice(0, 2))} autoComplete="off" />
        </Field>
      </div>

      <div className={s.previewBox} aria-live="polite">
        {preview ? (
          <>
            {preview.floor.isNew && <p>New floor: <strong>{preview.floor.name}</strong> ({preview.floor.code}){block ? ` in block ${block.hostel.name}` : ''}.</p>}
            {count ? (
              <p>Creates <strong>{plural(count, 'room')}</strong>, {codeRanges(preview.created)}, with {plural(preview.beds, 'bed')}.</p>
            ) : (
              <p>All these rooms already exist. Nothing to create.</p>
            )}
            {preview.skipped.length > 0 && (
              <p className={s.previewMuted}>{plural(preview.skipped.length, 'room')} already {preview.skipped.length === 1 ? 'exists' : 'exist'} and {preview.skipped.length === 1 ? 'stays' : 'stay'} as {preview.skipped.length === 1 ? 'it is' : 'they are'}: {codeRanges(preview.skipped)}.</p>
            )}
          </>
        ) : (
          <p className={s.previewMuted}>{checking ? 'Checking…' : `Fill in the floor and the numbers to see what will be created, for example ${prefix}101 to ${prefix}180.`}</p>
        )}
      </div>
      {chosenFloor && <p className={u.hint} style={{ margin: 0 }}>{chosenFloor.name} has {floorRangeText(chosenFloor) === 'No rooms yet' ? 'no rooms yet' : `${plural(chosenFloor.roomCount, 'room')}, ${floorRangeText(chosenFloor)}`}.</p>}
      {formError && !Object.keys(serverErrors).length && <p className={u.error} role="alert" style={{ margin: 0 }}>{formError}</p>}
    </DialogFrame>
  );
}

// ---- Remove rooms (range) -----------------------------------------------------------------------------------

function RemoveRoomsDialog({ target, onDone, onClose }: { target: FloorRef | null; onDone: (r: DeleteRoomRangeResult) => void; onClose: () => void }) {
  const open = target !== null;
  const floor = target?.floor;
  const [form, setForm] = useState<RemoveRoomsForm>({ from: '', to: '' });
  const [preview, setPreview] = useState<DeleteRoomRangeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { if (open) { setForm({ from: '', to: '' }); setPreview(null); setError(null); setConfirming(false); } }, [open, floor?.code]);

  const built = floor ? removeRoomsBody(floor.code, form, true) : null;
  const errors = built && 'errors' in built && (form.from || form.to) ? built.errors : {};
  const key = JSON.stringify(form);
  useEffect(() => {
    if (!open || !built || 'errors' in built) { setPreview(null); return; }
    let cancelled = false;
    setChecking(true); setError(null); setConfirming(false);
    const t = setTimeout(() => {
      deleteRoomRange(built.body)
        .then((r) => { if (!cancelled) setPreview(r); })
        .catch((err) => { if (!cancelled) { setPreview(null); setError(message(err)); } })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); setChecking(false); };
  }, [open, key]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!floor || !preview || preview.blocked.length || !preview.deleted.length) return;
    if (!confirming) { setConfirming(true); return; }
    const real = removeRoomsBody(floor.code, form, false);
    if ('errors' in real) return;
    setBusy(true);
    try {
      onDone(await deleteRoomRange(real.body));
    } catch (err) {
      setError(message(err));
      setConfirming(false);
      setForm((f) => ({ ...f })); // check again: someone may have been assigned meanwhile
    } finally {
      setBusy(false);
    }
  }

  const n = preview?.deleted.length ?? 0;
  return (
    <DialogFrame open={open} wide title={floor ? `Remove rooms from ${floor.name}` : 'Remove rooms'}
      subtitle={floor ? `${floor.name} has ${floorRangeText(floor) === 'No rooms yet' ? 'no rooms' : `${plural(floor.roomCount, 'room')}, ${floorRangeText(floor)}`}. Rooms with someone assigned can't be removed.` : undefined}
      onClose={onClose} onSubmit={submit}
      foot={<>
        <button type="button" className={u.btn} onClick={onClose}>Cancel</button>
        <button type="submit" className={`${u.btn} ${u.dangerBtn}`} disabled={busy || checking || !n || !!preview?.blocked.length}>
          {busy ? 'Removing…' : confirming ? `Yes, remove ${plural(n, 'room')}` : n ? `Remove ${plural(n, 'room')}` : 'Remove rooms'}
        </button>
      </>}>
      <div className={u.grid2}>
        <Field id="d-from" label="First number" error={errors.from}>
          <input {...inputProps('d-from', errors.from)} inputMode="numeric" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value.replace(/\D/g, '').slice(0, 3) }))} placeholder={floor ? String(Math.max(floor.roomNumberMin, floor.roomNumberMax - 9)) : ''} autoComplete="off" />
        </Field>
        <Field id="d-to" label="Last number" error={errors.to}>
          <input {...inputProps('d-to', errors.to)} inputMode="numeric" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value.replace(/\D/g, '').slice(0, 3) }))} placeholder={floor ? String(floor.roomNumberMax) : ''} autoComplete="off" />
        </Field>
      </div>
      {preview?.blocked.length ? (
        <BlockedList blocked={preview.blocked} />
      ) : (
        <div className={s.previewBox} aria-live="polite">
          {preview ? (
            n ? <p>Removes <strong>{plural(n, 'room')}</strong>: {codeRanges(preview.deleted)}. Nobody is assigned to them.{confirming && ' This can’t be undone; you can add the rooms again later.'}</p>
              : <p>There are no rooms in that range.</p>
          ) : (
            <p className={s.previewMuted}>{checking ? 'Checking…' : 'Fill in the numbers to see which rooms would go.'}</p>
          )}
        </div>
      )}
      {error && <p className={u.error} role="alert" style={{ margin: 0 }}>{error}</p>}
    </DialogFrame>
  );
}

// ---- One room: beds, delete -----------------------------------------------------------------------------------

function BedsDialog({ room, onDone, onClose }: { room: RoomSummary | null; onDone: (r: RoomSummary) => void; onClose: () => void }) {
  const [beds, setBeds] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (room) { setBeds(String(room.beds)); setError(null); } }, [room]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!room) return;
    const parsed = updateRoomBodySchema.safeParse({ beds: beds === '' ? undefined : Number(beds) });
    if (!parsed.success) { setError(parsed.error.issues[0]!.message); return; }
    if (parsed.data.beds < minBeds(room)) { setError(`At least ${minBeds(room)}: ${plural(room.occupants, 'bed is', 'beds are')} taken`); return; }
    setBusy(true);
    try {
      onDone(await setRoomBeds(room.code, parsed.data.beds));
    } catch (err) {
      setError(fieldErrors(err).beds ?? message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame open={room !== null} title={room ? `Beds in ${room.code}` : 'Beds'} onClose={onClose} onSubmit={submit}
      foot={<><button type="button" className={u.btn} onClick={onClose}>Cancel</button><button type="submit" className={`${u.btn} ${u.primary}`} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <Field id="e-beds" label="Beds" error={error ?? undefined}
        hint={room ? (room.occupants ? `${plural(room.occupants, 'bed is', 'beds are')} taken now, so at least ${minBeds(room)}.` : 'Nobody is in this room now.') : undefined}>
        <input {...inputProps('e-beds', error ?? undefined)} inputMode="numeric" value={beds} onChange={(e) => setBeds(e.target.value.replace(/\D/g, '').slice(0, 2))} autoComplete="off" />
      </Field>
    </DialogFrame>
  );
}

function DeleteRoomDialog({ room, onDone, onClose }: { room: RoomSummary | null; onDone: (code: string) => void; onClose: () => void }) {
  const [check, setCheck] = useState<DeleteRoomRangeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    setCheck(null); setError(null);
    deleteRoomRange({ floorCode: room.floorCode, from: room.number, to: room.number, dryRun: true })
      .then((r) => { if (!cancelled) setCheck(r); })
      .catch((err) => { if (!cancelled) setError(message(err)); });
    return () => { cancelled = true; };
  }, [room]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!room) return;
    setBusy(true);
    try {
      await deleteRoom(room.code);
      onDone(room.code);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const blocked = check?.blocked.length ? check.blocked : null;
  return (
    <DialogFrame open={room !== null} title={room ? `Delete room ${room.code}?` : 'Delete room'} onClose={onClose} onSubmit={submit}
      foot={<>
        <button type="button" className={u.btn} onClick={onClose}>{blocked ? 'Close' : 'Cancel'}</button>
        {!blocked && <button type="submit" className={`${u.btn} ${u.dangerBtn}`} disabled={busy || !check}>{busy ? 'Deleting…' : 'Delete room'}</button>}
      </>}>
      {blocked ? <BlockedList blocked={blocked} /> : (
        <p className={u.cardText} style={{ margin: 0, fontSize: 14 }}>
          {check ? `Its ${plural(room?.beds ?? 0, 'bed')} go with it. You can add the room again later with Add rooms.` : 'Checking…'}
        </p>
      )}
      {error && <p className={u.error} role="alert" style={{ margin: 0 }}>{error}</p>}
    </DialogFrame>
  );
}

// ---- the page --------------------------------------------------------------------------------------------------

export function HostelPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [structure, setStructure] = useState<HostelStructure[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [typed, setTyped] = useState(q);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [addingBlock, setAddingBlock] = useState(false);
  const [adding, setAdding] = useState<{ preset: FloorRef | null } | null>(null);
  const [removing, setRemoving] = useState<FloorRef | null>(null);
  const [editing, setEditing] = useState<RoomSummary | null>(null);
  const [deleting, setDeleting] = useState<RoomSummary | null>(null);
  const [deletingFloor, setDeletingFloor] = useState<FloorRef | null>(null);
  const [floorBusy, setFloorBusy] = useState(false);
  const [floorError, setFloorError] = useState<string | null>(null);

  const allFloors: FloorRef[] = (structure ?? []).flatMap((h) => h.floors.map((floor) => ({ hostel: h.hostel, floor })));
  const selectedCode = params.get('floor') ?? allFloors[0]?.floor.code ?? '';
  const selected = allFloors.find((f) => f.floor.code === selectedCode) ?? allFloors[0] ?? null;
  const many = (structure?.length ?? 0) > 1;

  const setQuery = (floor: string | null, nextQ: string) => {
    const p = new URLSearchParams();
    if (floor) p.set('floor', floor);
    if (nextQ) p.set('q', nextQ);
    setParams(p, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    hostelStructure()
      .then((list) => { if (!cancelled) { setStructure(list); setLoadError(null); } })
      .catch((err) => { if (!cancelled) { setStructure((x) => x ?? []); setLoadError(message(err, 'Could not load the hostel.')); } });
    return () => { cancelled = true; };
  }, [reload]);

  // Search as the admin types (250 ms after the last key).
  useEffect(() => {
    if (typed === q) return;
    const t = setTimeout(() => setQuery(selected?.floor.code ?? null, typed), 250);
    return () => clearTimeout(t);
  }, [typed]);

  const listKey = `${q}|${selected?.floor.code ?? ''}|${reload}`;
  useEffect(() => {
    if (!q && !selected) { setRooms([]); setNext(null); return; }
    let cancelled = false;
    setRooms(null); setRoomsError(null);
    roomsPage({ floor: selected?.floor.code, q })
      .then((page) => { if (!cancelled) { setRooms(page.items); setNext(page.nextCursor); } })
      .catch((err) => { if (!cancelled) { setRooms([]); setRoomsError(message(err, 'Could not load the rooms.')); } });
    return () => { cancelled = true; };
  }, [listKey]);

  async function more() {
    if (!next) return;
    try {
      const page = await roomsPage({ floor: selected?.floor.code, q, cursor: next });
      setRooms((r) => [...(r ?? []), ...page.items]);
      setNext(page.nextCursor);
    } catch (err) {
      setRoomsError(message(err, 'Could not load more rooms.'));
    }
  }

  const refresh = (text: string, floor?: string) => {
    setNotice(text);
    if (floor) setQuery(floor, '');
    setReload((n) => n + 1);
  };

  async function removeFloor() {
    if (!deletingFloor) return;
    setFloorBusy(true); setFloorError(null);
    try {
      await deleteFloor(deletingFloor.floor.code);
      const name = deletingFloor.floor.name;
      setDeletingFloor(null);
      setQuery(null, '');
      refresh(`Deleted ${name}.`);
    } catch (err) {
      setFloorError(message(err));
    } finally {
      setFloorBusy(false);
    }
  }

  const sum = totals(structure ?? []);
  return (
    <StaffLayout area="admin" nav={ADMIN_NAV}>
      <div className={u.head}>
        <h1>Hostel</h1>
        {structure && structure.length > 0 && (
          <div className={u.actions}>
            <button type="button" className={`${u.btn} ${u.outline}`} onClick={() => setAddingBlock(true)}>
              <PlusIcon size={18} aria-hidden="true" />
              Add block
            </button>
            <button type="button" className={`${u.btn} ${u.primary}`} onClick={() => setAdding({ preset: null })}>
              <PlusIcon size={18} weight="bold" aria-hidden="true" />
              Add rooms
            </button>
          </div>
        )}
      </div>

      {structure && sum.rooms > 0 && (
        <p className={s.totals} aria-label="Totals">
          <span className={u.pill}>{plural(sum.rooms, 'room')}</span>
          <span className={u.pill}>{plural(sum.beds, 'bed')}</span>
          <span className={u.pill}>{sum.occupied} taken</span>
          <span className={u.pill}>{sum.beds - sum.occupied} free</span>
        </p>
      )}

      <div aria-live="polite">
        {notice && (
          <p className={u.notice}>
            <CheckCircleIcon size={20} weight="fill" aria-hidden="true" />
            {notice}
          </p>
        )}
      </div>
      {loadError && <p className={u.error} role="alert">{loadError}</p>}

      {structure === null ? (
        <p className={u.empty} aria-busy="true">Loading…</p>
      ) : structure.length === 0 ? (
        <section className={`${u.card} ${s.start}`} aria-labelledby="start-title">
          <h2 id="start-title">Start with a block</h2>
          <p className={u.cardText}>A block is a building, for example West. Then add its floors and rooms by number range, for example CF101 to CF180.</p>
          <button type="button" className={`${u.btn} ${u.primary}`} onClick={() => setAddingBlock(true)}>
            <PlusIcon size={18} weight="bold" aria-hidden="true" />
            Add block
          </button>
        </section>
      ) : allFloors.length === 0 ? (
        <section className={`${u.card} ${s.start}`} aria-labelledby="start-title">
          <h2 id="start-title">Add the first floor</h2>
          <p className={u.cardText}>Choose a name and a two-letter room prefix, then the first and last room numbers. You'll see the rooms before they're created.</p>
          <button type="button" className={`${u.btn} ${u.primary}`} onClick={() => setAdding({ preset: null })}>
            <PlusIcon size={18} weight="bold" aria-hidden="true" />
            Add rooms
          </button>
        </section>
      ) : (
        <>
          <div className={`${u.views} ${s.floors}`} role="group" aria-label="Floor">
            {allFloors.map((f) => (
              <button key={f.floor.code} type="button" className={u.view} aria-pressed={!q && selected?.floor.code === f.floor.code} onClick={() => { setTyped(''); setQuery(f.floor.code, ''); }}>
                {many ? `${f.hostel.name} · ` : ''}{f.floor.name} · {floorRangeText(f.floor)}
              </button>
            ))}
          </div>

          <section className={s.floorCard} aria-labelledby="floor-title">
            {selected && !q && (
              <div className={s.floorHead}>
                <div>
                  <h2 id="floor-title">
                    {many ? `${selected.hostel.name} · ` : ''}{selected.floor.name}
                    <span className={u.pill}>{selected.floor.code}</span>
                  </h2>
                  <p className={s.floorStats}>{floorRangeText(selected.floor)} · {floorStatsText(selected.floor)}</p>
                </div>
                <div className={u.actions}>
                  <button type="button" className={`${u.btn} ${u.small} ${u.outline}`} onClick={() => setAdding({ preset: selected })}>
                    <PlusIcon size={16} aria-hidden="true" />
                    Add rooms here
                  </button>
                  {selected.floor.roomCount > 0 ? (
                    <button type="button" className={`${u.btn} ${u.small} ${u.outline}`} onClick={() => setRemoving(selected)}>
                      <MinusCircleIcon size={16} aria-hidden="true" />
                      Remove rooms
                    </button>
                  ) : (
                    <button type="button" className={`${u.btn} ${u.small} ${u.dangerBtn}`} onClick={() => { setFloorError(null); setDeletingFloor(selected); }}>
                      <TrashIcon size={16} aria-hidden="true" />
                      Delete floor
                    </button>
                  )}
                </div>
              </div>
            )}
            {q && <div className={s.floorHead}><h2 id="floor-title">Rooms starting with {q}</h2></div>}

            <div className={s.floorTools}>
              <div className={u.search}>
                <MagnifyingGlassIcon size={18} aria-hidden="true" />
                <input
                  className={u.input}
                  type="search"
                  value={typed}
                  onChange={(e) => setTyped(roomSearchText(e.target.value))}
                  placeholder="Find a room, e.g. CF127"
                  aria-label="Find a room by code, on any floor"
                  autoComplete="off"
                />
              </div>
            </div>

            {roomsError && <p className={u.error} role="alert" style={{ margin: '14px 18px 0' }}>{roomsError}</p>}
            {rooms === null ? (
              <p className={u.empty} aria-busy="true">Loading…</p>
            ) : rooms.length === 0 ? (
              <p className={u.empty}>{q ? `No room starts with ${q}.` : 'This floor has no rooms yet. Use Add rooms here.'}</p>
            ) : (
              <ul className={s.roomGrid} aria-label="Rooms">
                {rooms.map((r) => (
                  <li key={r.code} className={s.tile}>
                    <div className={s.tileTop}>
                      <span className={u.roomCode}>{r.code}</span>
                      <span className={s.tileActions}>
                        <button type="button" className={s.iconBtn} onClick={() => setEditing(r)} aria-label={`Change the beds in ${r.code}`} title="Change beds">
                          <PencilSimpleIcon size={16} aria-hidden="true" />
                        </button>
                        <button type="button" className={s.iconBtn} onClick={() => setDeleting(r)} aria-label={`Delete room ${r.code}`} title="Delete room">
                          <TrashIcon size={16} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                    <span className={u.beds} aria-hidden="true">
                      {Array.from({ length: r.beds }, (_, i) => <span key={i} className={i < r.occupants ? u.bed : `${u.bed} ${u.bedFree}`} />)}
                    </span>
                    <span className={s.tileText}>{takenText(r)}</span>
                  </li>
                ))}
              </ul>
            )}
            {next && (
              <div className={u.more}>
                <button type="button" className={u.btn} onClick={() => void more()}>Show more rooms</button>
              </div>
            )}
          </section>
        </>
      )}

      <AddBlockDialog open={addingBlock} onClose={() => setAddingBlock(false)} onDone={(name) => { setAddingBlock(false); refresh(`Added block ${name}. Now add its rooms.`); }} />
      <AddRoomsDialog
        open={adding !== null}
        structure={structure ?? []}
        preset={adding?.preset ?? null}
        onClose={() => setAdding(null)}
        onDone={(r) => {
          setAdding(null);
          refresh(`Created ${plural(r.created.length, 'room')} on ${r.floor.name}: ${codeRanges(r.created)}${r.skipped.length ? ` (${plural(r.skipped.length, 'room')} already existed)` : ''}.`, r.floor.code);
        }}
      />
      <RemoveRoomsDialog
        target={removing}
        onClose={() => setRemoving(null)}
        onDone={(r) => {
          setRemoving(null);
          refresh(`Removed ${plural(r.deleted.length, 'room')}: ${codeRanges(r.deleted)}.${r.blocked.length ? ` Kept ${codeRanges(r.blocked.map((b) => b.code))}: someone was just assigned.` : ''}`);
        }}
      />
      <BedsDialog room={editing} onClose={() => setEditing(null)} onDone={(r) => { setEditing(null); refresh(`${r.code} now has ${plural(r.beds, 'bed')}.`); }} />
      <DeleteRoomDialog room={deleting} onClose={() => setDeleting(null)} onDone={(code) => { setDeleting(null); refresh(`Deleted room ${code}.`); }} />
      <ConfirmDialog
        open={deletingFloor !== null}
        title={deletingFloor ? `Delete ${deletingFloor.floor.name}?` : 'Delete floor'}
        confirm="Delete floor"
        danger
        busy={floorBusy}
        onConfirm={() => void removeFloor()}
        onClose={() => setDeletingFloor(null)}
      >
        <p>It has no rooms. Its prefix {deletingFloor?.floor.code} can be used again for a new floor.</p>
        {floorError && <p className={u.error} role="alert" style={{ margin: '10px 0 0' }}>{floorError}</p>}
      </ConfirmDialog>
    </StaffLayout>
  );
}
