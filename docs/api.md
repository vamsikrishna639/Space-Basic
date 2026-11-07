# Space Basic: REST API plan (Step 4)

**Status:** adopted in go mode (2026-11-07). The user will review it later. The request and response shapes are zod schemas in `shared/src/schemas/*`, and the server validates every body, query and params against them.

## Conventions

**Base path:** `/api/v1`. Within v1, changes are additive only.

**Authentication:** `Authorization: Bearer <accessToken>`. The refresh cookie is `sb_rt` (HttpOnly; Secure in production; SameSite=Lax; Path=`/api/v1/auth`).

**Cookie endpoints:** `/auth/refresh` and `/auth/logout` require the header `X-SB-Client: 1`, and an `Origin` header from the allow-list when one is sent.

**Errors:** `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fields"?: { "email": "…" }, "requestId": "…" } }`

| Status | Code |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` (generic) |
| 403 | `FORBIDDEN`, `CONSENT_REQUIRED` |
| 404 | `NOT_FOUND`. Also used for other institutions' resources |
| 409 | `CONFLICT`, `ALREADY_SCANNED` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 429 | `RATE_LIMITED` (with `Retry-After`) |
| 500 | `INTERNAL` |

**Pagination:** cursor-based. Request: `?limit=20&cursor=<opaque>`. Response: `{ items: [...], nextCursor: string | null }`.

**Dates:** ISO 8601 UTC strings. The client formats them for display ("25 OCT 2026", "07:24 PM", "3 Nov 2026, 1:52 PM").

**Permissions:** the Permission column refers to `docs/architecture.md` §5. "auth" means any signed-in user; "public" means no token.

## Health

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/health` | public | – | `200 { status: "ok", time }` (no DB call; used to wake Render) |

## Auth (`/auth`)

**Shared types:**
- `Consent = { accepted: true, policyVersion: string }`. Required at sign-in; the server rejects `accepted !== true`.
- `AuthResult = { accessToken: string, expiresIn: 900, user: Me }`, plus a `Set-Cookie: sb_rt`.

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/auth/login` | public · rate-limited | `{ email, password, consent }` | `200 AuthResult` · `401 INVALID_CREDENTIALS` (same for unknown email, wrong password or disabled user) |
| POST | `/auth/otp/request` | public · rate-limited | `{ channel: 'email'\|'sms'\|'whatsapp', identifier, purpose: 'login', consent }`. For sms/whatsapp, `identifier` is a 10-digit Indian number or E.164 | `202 { sent: true, resendAfter: 30 }`, always the same (no enumeration) · `429` during cooldown |
| POST | `/auth/otp/verify` | public · rate-limited | `{ channel, identifier, code: /^\d{4}$/, consent }` | `200 AuthResult` · `401 INVALID_CREDENTIALS` (wrong or expired code; locked after 5 tries) |
| POST | `/auth/refresh` | cookie | – | `200 AuthResult` (cookie rotated) · `401`; reuse detected revokes the whole session family |
| POST | `/auth/logout` | cookie | – | `204`. Session revoked, cookie cleared |
| POST | `/auth/password/forgot` | public · rate-limited | `{ email }` | `202 { sent: true, resendAfter: 30 }`, always |
| POST | `/auth/password/reset` | public · rate-limited | `{ email, code, newPassword }` | `204`. All sessions revoked · `401 INVALID_CREDENTIALS` |
| POST | `/auth/password/change` | auth | `{ currentPassword, newPassword }` | `204`. Other sessions revoked; this one stays · `401 INVALID_CREDENTIALS` |

**Password rule:** 8–128 characters. Must not equal the email or phone.

## Users and profile (`/users`)

**`Me` returns:**

```
{ id, fullName, firstName, email|null, phone|null, roles,
  room: { hostelName, code, display: "West CS240" } | null,
  avatarUrl: string|null,                       // /api/v1/users/me/avatar?v=<hash>
  institution: { id, name, logoUrl|null, timezone, enabledModules, consentPolicyVersion },
  consent: { policyVersion, acceptedAt } | null }
```

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/users/me` | auth | – | `200 Me` |
| GET | `/users/me/avatar` | auth (own) | – | `200 image/*` (ETag) · `404` = use the default avatar |
| PUT | `/users/me/avatar` | `profile:update` | raw body `image/png\|jpeg\|webp` ≤ 1 MB | `200 { avatarUrl }` · `413` · `415` |
| DELETE | `/users/me/avatar` | `profile:update` | – | `204` |
| GET | `/users` | `users:read` | `?role=&q=&cursor=&limit=` | `200 { items: UserSummary[], nextCursor }` (wardens see students only) |
| POST | `/users` | `users:create` | `{ fullName, email?, phone?, roles, roomCode?, password? }` | `201 UserSummary` · `409` duplicate email/phone |
| POST | `/users/import` | `users:import` | `{ users: [same as POST /users] }` (≤ 500; the CSV script calls this) | `200 { created, skipped: [{ row, reason }] }` |
| PATCH | `/users/:id` | `users:update` | `{ fullName?, email?, phone?, roomCode?, status? }` | `200 UserSummary` (disabling revokes sessions) |
| PATCH | `/users/:id/roles` | `users:assign_role` | `{ roles }` | `200 UserSummary` · `403` granting `super_admin` |

**`UserSummary`:** `{ id, fullName, email|null, phone|null, roles, status, room: { code, display }|null, hasAvatar, hasPassword, createdAt }`. It never contains the password hash.

**Built behaviour (Users/Profile module, 2026-11-08):**
- **Avatar:**
  - The upload is a raw body. The bytes are checked against the declared type (PNG, JPEG or WebP magic numbers), so a mismatch gets `415`.
  - Authentication runs before any bytes are read.
  - Replacing a photo deletes the old one, so each user has at most one stored avatar.
  - `GET` answers with `Cache-Control: private, no-cache` and a sha256 `ETag`, and gives `304` on `If-None-Match`. The client fetches it with its Bearer token and shows it through a blob URL, because an `<img>` can't send the token.
- **List:**
  - Sorted by name, with an opaque cursor.
  - `q` searches the name (contains), the email (prefix), the phone (3 or more digits, contains) and the exact room code. Regex characters are treated literally.
  - Wardens get students only (`?role=` other than `student` is `403`).
  - `super_admin` users are left out unless the caller is `super_admin`.
- **Create and import:**
  - Roles are limited to `student`, `warden`, `institution_admin` and `super_admin`. `mess_staff` comes with the Mess module.
  - `roomCode` is for students only. The room must exist (`400`) and have a free bed (`409`).
  - Email and phone are checked across all institutions (`409` with `fields`).
  - Import handles rows one at a time, so capacity and duplicate checks see the earlier rows. The result's `row` is 1-based.
- **Update:**
  - `null` clears `email`, `phone` or `roomCode`, but one of email or phone must remain.
  - Disabling a user revokes all of their sessions.
  - An admin can't disable themself, edit a `super_admin`, or change their own roles.
  - A user with no `student` role leaves their room.
  - Another institution's user gives `404`.
- **Audit:** `user.create`, `user.import` (counts only), `user.update` (field names, not values), `user.disable`, `user.enable` and `user.role_change` (from and to).
- **CSV import script:** `npm run import-users -w server -- <file.csv> --accept-privacy-policy [--api <base>]`. It reads `SB_ADMIN_EMAIL` and `SB_ADMIN_PASSWORD` from the environment, signs in, posts batches that fit both the 500-row and 100 kB limits, prints skipped rows with their CSV line numbers, and signs out. Columns: `fullName,email,phone,roles,roomCode,password`, with roles separated by `|`. A fake example is in `server/src/scripts/users.example.csv`.

## Consent (`/consent`)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/consent/policy` | public | – | `200 { policyVersion, url }` |
| GET | `/consent/me` | auth (own) | – | `200 { current: { policyVersion, acceptedAt } \| null, history: [{ policyVersion, acceptedAt, withdrawnAt }] }` |
| POST | `/consent/withdraw` | auth (own) | `{ confirm: true }` | `204`. Every session is revoked and the action audited. The next sign-in needs the box ticked again |

**Built behaviour (Consent module, 2026-11-08):**
- **`GET /consent/me`:** `history` items are `{ policyVersion, acceptedAt, withdrawnAt, source: 'signin' | 'reconsent' }`, newest first. The IP address and user agent are kept as DPDPA evidence but never returned.
- **Withdraw:** every active record gets `withdrawnAt` (records are never deleted), every session is revoked (`consent_withdrawn`), the refresh cookie is cleared, and `consent.withdraw` is audited with counts. The access token stops working at once.
- **Signing in again** after a withdrawal, or after a new policy version, records `source: 'reconsent'`.
- **`POST /auth/refresh`** answers `403 CONSENT_REQUIRED` (cookie cleared, session revoked as `consent_required`) when the user has no active consent for the current policy version. After a version bump, users are sent back to sign-in within one access-token lifetime (15 min).

## Hostel (`/hostel`)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/hostel/structure` | `hostel:read` (inst) | – | `200 [{ hostel, floors: [{ code, name, roomNumberMin, roomNumberMax, bedsPerRoom, roomCount }] }]` |
| GET | `/hostel/rooms` | `hostel:read` (inst) | `?floor=CS&cursor=&limit=` | `200 { items: [{ code, number, beds, occupants }], nextCursor }` |
| POST | `/hostel/hostels` | `hostel:manage` | `{ name, code }` | `201` |
| POST | `/hostel/floors` | `hostel:manage` | `{ hostelCode, code, name, roomNumberMin, roomNumberMax, bedsPerRoom }` | `201` |
| POST | `/hostel/floors/:code/rooms/generate` | `hostel:manage` | `{ hostelCode }` | `200 { created }`: creates every room in the floor's range (idempotent) |
| PATCH | `/hostel/rooms/:code` | `hostel:manage` | `{ beds }` | `200` |

A student's own room is in `GET /users/me`.

**Built behaviour (Hostel module, 2026-11-08):**
- **Access:** reads need `hostel:read` (wardens and admins). Students get `403`; their room comes with `/users/me`.
- **`GET /hostel/rooms`:**
  - Rows are `{ code, number, floorCode, hostelCode, beds, occupants }`. `occupants` counts active users only.
  - Optional `?hostel=W` and `?floor=CS` filters; an unknown hostel or floor is `404`.
  - Sorted by room code, with an opaque cursor; `limit` is at most 50.
- **Creating:**
  - Codes are upper-cased. Hostel codes are 1–6 letters or digits, and floor codes are 2 letters.
  - A floor code is unique across the whole institution, so room codes like `CS240` stay unambiguous (`409`).
  - `order` defaults to the next position.
  - `POST /hostel/floors` returns `201` with the floor and `roomCount: 0`.
- **Generate** inserts only the missing room numbers, with `beds` from the floor's `bedsPerRoom`. Running it again returns `{ created: 0 }`. It needs the floor in the named hostel (`404` otherwise).
- **`PATCH /hostel/rooms/:code`** returns the `RoomSummary`. `beds` is 1–12 and can't go below the current occupants (`409`).
- **Audit:** `hostel.create`, `floor.create`, `rooms.generate` (only when rooms were created) and `room.update` (beds from and to).
- **Other institutions:** their rooms and floors are `404` and never listed.

## Notifications (`/notifications`)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/notifications` | `notifications:read` (own) | `?cursor=&limit=` (≤ 50) | `200 { items: [{ id, type, title, body, link, readAt, createdAt }], nextCursor }`, newest first |
| GET | `/notifications/unread-count` | `notifications:read` | – | `200 { count }`. The client shows "99+" above 99 |
| POST | `/notifications/:id/read` | `notifications:mark_read` (own) | – | `204` (idempotent) |

**Built behaviour (Notifications module, 2026-11-08):**
- **Items:** `{ id, type, title, body|null, link: { module, refId|null }|null, readAt|null, createdAt }`.
  - `type` is one of `attendance_marked`, `announcement_new`, `leave_submitted`, `leave_partially_approved` and `leave_approved`.
  - Titles are exactly as in the screenshot: "Attendance Marked", "👋 New Announcement", "Leave Request Submitted", "Leave Partially Approved" and "Great News: Leave Approved".
  - `link.module` is `attendance`, `announcements` or `leave`. Modules that aren't live open ComingSoon on the client.
- **Paging and access:** sorted by `createdAt` then `_id`, newest first, with an opaque cursor. Only the caller's own notifications are visible.
- **Mark read:** keeps the first `readAt`. Someone else's notification, or another institution's, gives `404` and stays unread.
- **Module gate:** the whole router sits behind `requireModule('notifications')`, so it answers `404` when the module is switched off for the institution.
- **For other modules:** `createNotification({ institutionId, userId, type, body?, refId? })` fills in the title and deep link. QR/Attendance calls it after a successful scan.
- **Dev seed:** six FAKE samples per dev user, covering every type, spread over the three days before the seed runs (never in the future), with the two oldest already read. They're added only for users with none, on first start or at the next `npm run dev`.

## Attendance (`/attendance`)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/attendance/qr-token` | `attendance:qr:issue` (student) | – | `200 { token, expiresAt, refreshAfterMs: 10000 }`, with `Cache-Control: no-store` |
| POST | `/attendance/scan` | `attendance:scan` (warden, admin) | `{ token }` | `201 { student: { fullName, room: "West CS240" }, scannedAt }` · `400` bad/expired token · `404` other institution · `409 ALREADY_SCANNED` |
| GET | `/attendance/me` | `attendance:read` (own) | `?cursor=&limit=` | `200 { items: [{ scannedAt, kind, scannedByName }], nextCursor }` |
| GET | `/attendance` | `attendance:read` (inst) | `?date=YYYY-MM-DD&cursor=&limit=` | `200 { items: [{ student, room, scannedAt, scannedByName }], nextCursor }` |

The QR token is a JWT signed with `QR_TOKEN_SECRET`. Claims: `{ sub: studentId, inst, jti, iat, exp: iat + 15 s }`. It contains no personal data.

## Support (`/support`)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/support/contacts` | `support:read` | – | `200 { hostelOffice: Contact[], spacebasic: Contact[] }` |
| GET | `/support/faqs` | `support:read` | `?category=` | `200 [{ id, question, answer, category }]` (published only) |
| POST / PATCH / DELETE | `/support/contacts[/:id]` | `support:manage` | Contact fields | `201` / `200` / `204` |
| POST / PATCH / DELETE | `/support/faqs[/:id]` | `support:manage` | FAQ fields | `201` / `200` / `204` |

## Institutions (`/institutions`)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/institutions/:id/logo` | public | – | `200 image/*` (cacheable, ETag) · `404` |
| PATCH | `/institutions/current` | `institution:manage` | `{ name?, enabledModules?, timezone? }` | `200` (audited) |
| PUT | `/institutions/current/logo` | `institution:manage` | raw image ≤ 1 MB | `200 { logoUrl }` |
| POST | `/institutions` | `institution:create` (super_admin) | `{ name, slug, timezone? }` | `201` |

## Rate limits (defaults; the values live in env)

| Scope | Limit |
|---|---|
| Global, per IP | 300 requests / 5 min |
| `/auth/login`, `/auth/otp/verify`, `/auth/password/reset`, per IP | 20 / 15 min |
| `/auth/login`, per identifier (Mongo counter) | 10 failures / 15 min |
| `/auth/otp/request`, `/auth/password/forgot`, per identifier | 1 / 30 s cooldown and 5 / hour |
| Same routes, per IP | 30 / hour |
| `/attendance/scan`, per scanner | 120 / min |

## Not in Phase 1

Leave, Tickets, Announcements, Mess and My Information have no endpoints. Their entry points open ComingSoon, and their routers aren't mounted.
