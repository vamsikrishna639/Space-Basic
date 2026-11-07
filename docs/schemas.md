# Space Basic: Mongoose schemas and indexes (Step 3)

**Status:** adopted in go mode (2026-11-07). The user will review it later.

**Conventions**

- Every schema uses `timestamps: true` (`createdAt`, `updatedAt`) and `versionKey: false`.
- `toJSON` renames `_id` to `id` and strips every field marked *secret* below.
- **Tenant-scoped (T)** collections carry a required `institutionId: ObjectId` and use the `tenantScope` plugin (`docs/architecture.md` §6). Every compound index starts with `institutionId`.
- **Global (G)** collections don't use the plugin. Each access to one is a named, reviewed exception.

Phase 1 implements the collections in §1. §2 lists the later collections, so Phase 1 indexes and enums leave room for them.

## 1. Phase 1 collections

### 1.1 `institutions` (G)

| Field | Type | Notes |
|---|---|---|
| `name` | String, required, 2–120 chars | Shown uppercase on Home ("PRESIDENCY UNIVERSITY") |
| `slug` | String, required, lowercase, `^[a-z0-9-]{2,60}$` | Unique |
| `timezone` | String, default `Asia/Kolkata` | Used for date grouping and the greeting fallback |
| `enabledModules` | [String] from `MODULE_KEYS` | Phase 1 default: `['notifications','support','attendance','leave','tickets','announcements','mess']`. The last four are listed so their entry points show; their registry status is `coming_soon` |
| `logo` | `{ assetId: ObjectId → assets, updatedAt }` or null | Presidency logo uploaded as an asset |
| `consentPolicyVersion` | String, required, default `'2026-11-01'` | The policy version users must accept |
| `status` | `'active'` \| `'suspended'` | |

**Indexes:** `{ slug: 1 }` unique.

### 1.2 `users` (T, with a global login lookup)

| Field | Type | Notes |
|---|---|---|
| `institutionId` | ObjectId → institutions, required | |
| `fullName` | String, required, 2–120 chars | Stored as entered, displayed uppercase (the reference screenshot shows a real name, which is never committed; seed data is fake) |
| `email` | String, lowercase, trimmed, valid email, optional | **Globally unique** when present |
| `phone` | String, E.164 (`^\+[1-9]\d{7,14}$`), optional | **Globally unique** when present. Indian 10-digit input is normalised to `+91…` |
| `passwordHash` | String, **secret** (`select: false`) | bcrypt, cost 12. Null means "OTP only until set" |
| `roles` | [String], ≥1, from `student, warden, mess_staff, institution_admin, super_admin` | Phase 1 implements the first three plus super_admin for platform setup |
| `status` | `'active'` \| `'disabled'` | A disabled user can't sign in; existing sessions are revoked |
| `roomId` | ObjectId → rooms, optional (students) | Displayed as "West CS240" (hostel name + room code) |
| `avatar` | `{ assetId → assets, updatedAt }` or null | Null means the default avatar |
| `passwordChangedAt` | Date | |
| `lastLoginAt` | Date | |

- **Validation:** at least one of `email` or `phone` is required.
- **Indexes:**
  - `{ email: 1 }` unique, partial (`email` exists)
  - `{ phone: 1 }` unique, partial (`phone` exists)
  - `{ institutionId: 1, roles: 1, fullName: 1 }`
  - `{ institutionId: 1, roomId: 1 }`
- **Global lookup exception:** `auth/service.findLoginCandidate(identifier)` is the only unscoped read. It reads by `email` or `phone`, and the user's `institutionId` then scopes everything else.

### 1.3 `sessions` (T) — refresh-token families

| Field | Type | Notes |
|---|---|---|
| `institutionId`, `userId` | ObjectId, required | |
| `currentHash` | String, **secret** | SHA-256 of the current refresh token |
| `previousHashes` | [String], **secret** | Rotated-out hashes, kept for reuse detection |
| `lastUsedAt` | Date | |
| `expiresAt` | Date | `lastUsedAt` + 30 days (sliding) |
| `absoluteExpiresAt` | Date | `createdAt` + 90 days (hard limit) |
| `revokedAt` | Date or null | |
| `revokedReason` | `'logout'` \| `'reuse_detected'` \| `'password_changed'` \| `'password_reset'` \| `'consent_withdrawn'` \| `'disabled'` \| `'admin'` | |
| `userAgent` | String ≤ 300 | Shown nowhere in Phase 1; for audit only |

**Indexes:**
- `{ currentHash: 1 }` unique
- `{ previousHashes: 1 }` (reuse lookup)
- `{ institutionId: 1, userId: 1, revokedAt: 1 }`
- `{ absoluteExpiresAt: 1 }` TTL (`expireAfterSeconds: 0`)

### 1.4 `otp_codes` (G)

| Field | Type | Notes |
|---|---|---|
| `purpose` | `'login'` \| `'reset_password'` | |
| `channel` | `'email'` \| `'sms'` \| `'whatsapp'` | |
| `identifier` | String | Normalised email or E.164 phone |
| `userId` | ObjectId or null | Null when the identifier is unknown: a decoy record keeps timing and responses identical |
| `codeHash` | String, **secret** | HMAC-SHA256(code, `OTP_PEPPER`) |
| `attempts` | Number, default 0 | At most 5 |
| `expiresAt` | Date | Now + 5 min |
| `consumedAt` | Date or null | |

**Indexes:** `{ identifier: 1, purpose: 1, createdAt: -1 }`, plus `{ expiresAt: 1 }` TTL.

### 1.5 `rate_counters` (G)

`{ key: String, count: Number, expiresAt: Date }`. Fixed-window counters for limits that must survive a restart: OTP sends per identifier, failed logins per identifier.

**Indexes:** `{ key: 1 }` unique, plus `{ expiresAt: 1 }` TTL.

### 1.6 `consents` (T)

| Field | Type | Notes |
|---|---|---|
| `institutionId`, `userId` | ObjectId, required | |
| `policyVersion` | String, required | |
| `acceptedAt` | Date, required | |
| `source` | `'signin'` \| `'reconsent'` | |
| `withdrawnAt` | Date or null | |
| `ip`, `userAgent` | String | Recorded under DPDPA as evidence of consent. Never shown to other users |

**Index:** `{ institutionId: 1, userId: 1, acceptedAt: -1 }`.

**Current consent** = the latest record for the user's institution's `consentPolicyVersion` that hasn't been withdrawn.

### 1.7 `hostels`, `floors`, `rooms` (T) — data-driven layout

**`hostels`**
- Fields: `name` ("West"), `code` ("W"), `order`.
- Index: unique `{ institutionId, code }`.

**`floors`**
- Fields: `hostelId`, `code` (`^[A-Z]{2}$`: "CF", "CS", "CT"), `name` ("First floor"), `order`, `roomNumberMin`, `roomNumberMax`, `bedsPerRoom` (default 3).
- Index: unique `{ institutionId, hostelId, code }`.

**`rooms`**

| Field | Type | Notes |
|---|---|---|
| `hostelId`, `floorId` | ObjectId, required | |
| `number` | Number | Validated against the floor's `[roomNumberMin, roomNumberMax]` |
| `code` | String | Floor code + 3-digit number, e.g. "CS240". `^[A-Z]{2}\d{3}$`, and the prefix must equal the floor code |
| `beds` | Number, 1–12 | Defaults to the floor's `bedsPerRoom` |

- **Indexes:** unique `{ institutionId, code }`, and `{ institutionId, floorId, number }`.
- **Seed (fake placeholder values):** hostel "West"; floors CF 101–200, CS 201–300, CT 301–400; 3 beds per room.

### 1.8 `notifications` (T)

| Field | Type | Notes |
|---|---|---|
| `institutionId`, `userId` | ObjectId, required | |
| `type` | `'attendance_marked'` \| `'announcement_new'` \| `'leave_submitted'` \| `'leave_partially_approved'` \| `'leave_approved'` | Extended in later phases (additive) |
| `title` | String ≤ 120 | Exactly as displayed, e.g. "Attendance Marked", "👋 New Announcement", "Great News: Leave Approved" |
| `body` | String ≤ 500, optional | |
| `link` | `{ module: ModuleKey, refId?: ObjectId }` or null | Deep-link target. Phase 1 modules that aren't live open ComingSoon |
| `readAt` | Date or null | |

**Indexes:**
- `{ institutionId: 1, userId: 1, createdAt: -1, _id: -1 }`: the list, with cursor pagination
- `{ institutionId: 1, userId: 1, readAt: 1 }`: unread count

### 1.9 `attendance_logs` (T)

| Field | Type | Notes |
|---|---|---|
| `institutionId`, `studentId`, `scannedBy` | ObjectId, required | |
| `scannedAt` | Date, required | |
| `kind` | `'attendance'` (Phase 1); later `'amenity'` \| `'checkin'` | |
| `jti` | String, required | The QR token id. **Unique**, which provides the replay protection |

**Indexes:** `{ jti: 1 }` unique, `{ institutionId: 1, studentId: 1, scannedAt: -1 }`, `{ institutionId: 1, scannedAt: -1 }`.

### 1.10 `support_contacts` (T) and `faqs` (T)

**`support_contacts`**
- Fields: `group` (`'hostel_office'` \| `'spacebasic'`), `label`, `phone?` (E.164), `email?`, `hours?`, `order`.
- Index: `{ institutionId, group, order }`.

**`faqs`**
- Fields: `question` (≤ 200), `answer` (≤ 4000, plain text), `category` (`'leave'` \| `'tickets'` \| `'announcements'` \| `'signing_in'` \| `'other'`), `order`, `published` (Boolean).
- Index: `{ institutionId, published, category, order }`.

### 1.11 `assets` (T) — binary images

| Field | Type | Notes |
|---|---|---|
| `institutionId` | ObjectId, required | |
| `kind` | `'avatar'` \| `'institution_logo'` | |
| `ownerId` | ObjectId | User or institution |
| `contentType` | `'image/png'` \| `'image/jpeg'` \| `'image/webp'` | |
| `size` | Number, ≤ 1 MB | |
| `data` | Buffer, **secret** | Excluded from lists |
| `sha256` | String | Used for the ETag |

**Index:** `{ institutionId: 1, kind: 1, ownerId: 1 }`.

Avatars are served only to members of the same institution. Logos are public by institution id (not sensitive), so the logo can show before sign-in data loads.

### 1.12 `audit_logs` (T, with `institutionId` null allowed for platform actions)

| Field | Type | Notes |
|---|---|---|
| `actorId` | ObjectId or null (system) | |
| `action` | String, e.g. `user.create`, `user.role_change`, `consent.withdraw`, `session.reuse_detected`, `password.reset`, `attendance.scan`, `institution.modules_update` | |
| `targetType`, `targetId` | | |
| `meta` | Mixed, small | Never secrets |
| `requestId` | String | |
| `at` | Date | |

**Indexes:** `{ institutionId: 1, at: -1 }` and `{ action: 1, at: -1 }`.

## 2. Later phases (not built in Phase 1; listed so Phase 1 leaves room)

| Phase | Collection | Key fields |
|---|---|---|
| 2 | `leave_requests` (T) | studentId, from/to, reason, `status` (`submitted` \| `partially_approved` \| `approved` \| `rejected` \| `cancelled`), `approvals[]` ({ step, approverRole, approverId, decision, at }) |
| 3 | `tickets` (T) | category, status, comments[] |
| 4 | `announcements` (T) | audience targeting, publishedAt |
| 5 | `mess_menus`, `mess_bookings` (T) | Uses the `mess_staff` role |

The additions they need in Phase 1 are already there:
- the `MODULE_KEYS` list
- the notification `type` enum, extended additively
- the `link.module` field
- the role enum

## 3. Seed (development only; refuses when `NODE_ENV=production`)

All fake:
- 1 institution, "Presidency University", with the supplied logo
- hostel "West", 3 floors, 300 rooms
- users:
  - student "Arjun Kumar Rao", CS240
  - warden "Meera Nair"
  - institution admin "Rahul Verma"
  - super admin "Space Basic Admin"
- a few notifications per type, support contacts and FAQs

Passwords are printed by the seed script and in the checkpoint message. They're dev-only and not secret.
