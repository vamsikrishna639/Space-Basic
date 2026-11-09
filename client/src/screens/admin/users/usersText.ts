import {
  CSV_COLUMNS, CsvError, createUserBodySchema, IMPORT_MAX_ROWS, normalizePhone, parseCsv, recordsToRows,
  type CreateUserBody, type Role, type RoomSummary, type UpdateUserBody, type UserSummary,
} from '@spacebasic/shared';

// Pure logic of the admin Users screens (FREE DESIGN; docs/not-from-reference.md), unit-tested in usersText.test.ts.

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  warden: 'Warden',
  mess_staff: 'Mess staff',
  institution_admin: 'Admin',
  super_admin: 'SpaceBasic staff',
};

export const ROLE_HINT: Partial<Record<Role, string>> = {
  student: 'Lives in the hostel: has a room, an Entry Pass and the student app',
  warden: 'Scans Entry Passes and looks up students and rooms',
  institution_admin: 'Manages users, the hostel and support content',
  super_admin: 'SpaceBasic platform staff (only SpaceBasic staff can grant this)',
};

// ---- list views ------------------------------------------------------------------------------------------

export type UsersView = 'all' | 'students' | 'waiting' | 'wardens' | 'admins' | 'disabled';

export const VIEWS: { key: UsersView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'students', label: 'Students' },
  { key: 'waiting', label: 'Waiting for a room' },
  { key: 'wardens', label: 'Wardens' },
  { key: 'admins', label: 'Admins' },
  { key: 'disabled', label: 'Disabled' },
];

export function parseView(v: string | null): UsersView {
  return VIEWS.some((x) => x.key === v) ? (v as UsersView) : 'all';
}

/** The GET /users query for a view. "Waiting for a room" = active students without a room: the ones to accept. */
export function usersQuery(view: UsersView, q: string, cursor?: string | null, limit = 25): string {
  const p = new URLSearchParams({ limit: String(limit) });
  const filters: Record<UsersView, Record<string, string>> = {
    all: {},
    students: { role: 'student' },
    waiting: { role: 'student', room: 'none', status: 'active' },
    wardens: { role: 'warden' },
    admins: { role: 'institution_admin' },
    disabled: { status: 'disabled' },
  };
  for (const [k, v] of Object.entries(filters[view])) p.set(k, v);
  if (q.trim()) p.set('q', q.trim());
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

export function emptyListText(view: UsersView, q: string): string {
  if (q.trim()) return `No users match "${q.trim()}".`;
  if (view === 'waiting') return 'Nobody is waiting for a room.';
  if (view === 'disabled') return 'No disabled users.';
  return 'No users here yet.';
}

/** A student who should be given a room (shown with "Accept" in the list). */
export const waitsForRoom = (u: UserSummary) => u.status === 'active' && u.roles.includes('student') && !u.room;

// ---- rooms -----------------------------------------------------------------------------------------------

export function freeBeds(r: Pick<RoomSummary, 'beds' | 'occupants'>): number {
  return Math.max(0, r.beds - r.occupants);
}

export function freeBedsText(r: Pick<RoomSummary, 'beds' | 'occupants'>): string {
  const n = freeBeds(r);
  return `${n} of ${r.beds} bed${r.beds === 1 ? '' : 's'} free`;
}

/** What the admin types in the room search: upper-cased letters and digits, at most "CS240". Anything else is cut. */
export function roomSearchText(v: string): string {
  const m = /^[A-Z]{0,2}\d{0,3}/.exec(v.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  return m ? m[0] : '';
}

// ---- add / edit form -------------------------------------------------------------------------------------

export interface UserForm {
  fullName: string;
  email: string;
  phone: string;
  roles: Role[];
  roomCode: string | null;
  password: string;
}

export const EMPTY_FORM: UserForm = { fullName: '', email: '', phone: '', roles: ['student'], roomCode: null, password: '' };

export function formFrom(u: UserSummary, displayPhone: (p: string) => string): UserForm {
  return { fullName: u.fullName, email: u.email ?? '', phone: u.phone ? displayPhone(u.phone) : '', roles: [...u.roles], roomCode: u.room?.code ?? null, password: '' };
}

/** First message per field, from the same zod schema the server uses. */
export function formErrors(form: UserForm, { withPassword }: { withPassword: boolean }): Record<string, string> {
  const r = createUserBodySchema.safeParse(toCreateBody(form, withPassword));
  const out: Record<string, string> = {};
  if (r.success) return out;
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

export function toCreateBody(form: UserForm, withPassword = true): CreateUserBody {
  const isStudent = form.roles.includes('student');
  return {
    fullName: form.fullName,
    email: form.email,
    phone: form.phone,
    // Typed as every role; the schema refuses the ones that can't be assigned yet (mess_staff) with "Unknown role".
    roles: form.roles as CreateUserBody['roles'],
    roomCode: isStudent && form.roomCode ? form.roomCode : '',
    password: withPassword ? form.password : '',
  };
}

const sameRoles = (a: readonly Role[], b: readonly Role[]) => a.length === b.length && a.every((r) => b.includes(r));

/**
 * What saving the edit form sends: the roles (PATCH /users/:id/roles, sent first) and the other fields (PATCH /users/:id).
 * A cleared email or phone is sent as null. The room is left out when the user is no longer a student: changing
 * the roles already takes them out of their room.
 */
export function editChanges(original: UserSummary, form: UserForm): { roles: Role[] | null; fields: UpdateUserBody | null } {
  const roles = sameRoles(original.roles, form.roles) ? null : [...form.roles];
  const fields: UpdateUserBody = {};
  const name = form.fullName.trim().replace(/\s+/g, ' ');
  if (name !== original.fullName) fields.fullName = form.fullName;

  const email = form.email.trim().toLowerCase();
  if (email !== (original.email ?? '')) fields.email = email || null;

  const phone = form.phone.trim();
  const normalized = phone ? normalizePhone(phone) : null;
  if (!phone && original.phone) fields.phone = null;
  else if (phone && normalized !== original.phone) fields.phone = phone; // an invalid number goes to validation as typed

  if (form.roles.includes('student')) {
    const before = original.room?.code ?? null;
    if (form.roomCode !== before) fields.roomCode = form.roomCode;
  }
  return { roles, fields: Object.keys(fields).length ? fields : null };
}

// ---- CSV import ------------------------------------------------------------------------------------------

/** One upload can hold a few batches; the API takes at most IMPORT_MAX_ROWS rows per request. */
export const IMPORT_MAX_FILE_ROWS = IMPORT_MAX_ROWS * 4;
export const IMPORT_MAX_FILE_BYTES = 1024 * 1024;

export interface ImportRow {
  line: number;
  row: Record<string, unknown>;
  /** null: ready to send. Otherwise the first problem found in the browser (the server checks again). */
  problem: string | null;
}

const FIELD_NAME: Record<string, string> = { fullName: 'Name', email: 'Email', phone: 'Mobile', roles: 'Roles', roomCode: 'Room', password: 'Password' };

/** Parse and check a user CSV the way the server will. Throws CsvError for a file that can't be read at all. */
export function checkImport(text: string): ImportRow[] {
  const rows = recordsToRows(parseCsv(text));
  if (!rows.length) throw new CsvError('The file has a header but no rows.');
  if (rows.length > IMPORT_MAX_FILE_ROWS) throw new CsvError(`The file has ${rows.length} rows. Import at most ${IMPORT_MAX_FILE_ROWS} at a time.`);
  const seen = new Map<string, number>();
  return rows.map(({ line, row }) => {
    const parsed = createUserBodySchema.safeParse(row);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = FIELD_NAME[String(issue.path[0])];
      return { line, row, problem: field ? `${field}: ${issue.message}` : issue.message };
    }
    // The same person twice in one file: the second row would be refused as "already in use".
    for (const [kind, value] of [['email', parsed.data.email], ['mobile number', parsed.data.phone]] as const) {
      if (!value) continue;
      const first = seen.get(`${kind}:${value}`);
      if (first !== undefined) return { line, row, problem: `Same ${kind} as line ${first}` };
    }
    if (parsed.data.email) seen.set(`email:${parsed.data.email}`, line);
    if (parsed.data.phone) seen.set(`mobile number:${parsed.data.phone}`, line);
    return { line, row, problem: null };
  });
}

/** A template with the header and two FAKE rows. */
export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(','),
  'Priya Sharma,priya.sharma@example.com,90000 00011,student,CS241,',
  'Anil Kumar,,9000000013,warden,,',
].join('\r\n') + '\r\n';

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
