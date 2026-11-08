# Space Basic: College Hostel Management System (PWA)

This is SPEC.md, the original project specification, updated with the decisions made since. Project rules and decisions also live in `CLAUDE.md` and `docs/decisions.md`.

**Precedence when sources disagree (highest first):** the user's latest chat instructions, `docs/decisions.md`, `CLAUDE.md`, then this file. Screenshots and assets live in `./reference-ui/`.

---

## ROLE
You are a senior full-stack engineer. Build "Space Basic", a complete College Hostel Management System, as a Progressive Web App. The UI must be an EXACT, pixel-perfect replica of the screenshots in `./reference-ui/` (see "PIXEL-PERFECT UI CONSTRAINT" below, which has the highest priority in this document). Treat the screenshots as the source of truth for layout, spacing, copy, icons, colours and dark/light styling. Read every screenshot and asset before writing any code.

## TECH STACK (fixed)
- Monorepo: one npm workspace with `client/`, `server/` and `shared/` (shared zod schemas and API types)
- Frontend: React.js + Vite, TypeScript (strict)
- Backend: Node.js + Express.js, TypeScript (strict)
- Database: MongoDB Atlas, with Mongoose
- Auth: JWT + bcrypt
- Validation: zod
- Tests: Jest + Supertest + mongodb-memory-server (server), vitest (client), Playwright in the official Linux Docker image (visual tests)
- Font: Plus Jakarta Sans, self-hosted via `@fontsource-variable/plus-jakarta-sans` (Latin subset)
- No paid services
- Deploy: Vercel (frontend), Render (backend), Git + GitHub
- IDE: VS Code

## NON-NEGOTIABLE RULES
1. Modular, maintainable architecture. Frontend and backend are separate folders (`/client`, `/server`).
2. REST APIs only, versioned under `/api/v1`.
3. Validate ALL incoming data with zod.
4. Hash passwords with bcrypt before storing. Never log or return password hashes.
5. Secrets live only in `.env` files. Commit `.env.example` with placeholders. `.env` must be in `.gitignore` BEFORE the first commit.
6. Never put real credentials in source code, and never ask me to paste secrets into this chat. Tell me which variables to fill in.
7. Role-based access control is enforced in backend middleware, not just in frontend routes.
8. Reusable React components, mobile-first responsive layout, proper error handling on both sides (central Express error handler, React error boundary, user-friendly messages).
9. Do NOT build everything in one step. Explain the architecture first, then work module by module and test each module before moving on.
10. Do not delete or overwrite existing code without explaining why first.
11. No paid services, ever. Free, open-source dependencies (MIT, Apache, BSD, ISC) are pre-approved; list each one with its licence in `docs/decisions.md`.
12. Keep development and production configs separate.

## PIXEL-PERFECT UI CONSTRAINT (highest priority, overrides any design preference)

**Scope (user decision, 2026-11-08):** this constraint applies to STUDENT screens only. Warden and institution_admin screens are free design: see "Staff screens (free design)" below.

The UI must be an exact visual replica of the screenshots in ./reference-ui/.
Not "similar", not "inspired by", not "improved". Identical.

1. Do NOT change, add, remove, rename, reorder, restyle or "improve" anything
   visible in the screenshots: text, punctuation (including "—", "·", "..."),
   capitalisation, spelling (keep "Forgot password?" exactly as shown),
   icons, icon stroke style, colours, gradients, shadows, border radius,
   spacing, font sizes/weights/letter-spacing, element order, alignment,
   badge positions, the status of every control (disabled/active), and
   animations/transitions where they can be inferred.
2. Do not add any element that is not in the screenshots (extra buttons,
   banners, helper text, loaders, emoji, headings). If something new is
   functionally required (for example an OTP entry screen, or screens I did
   not supply), use the Phase 1 defaults below where they apply, otherwise ask me. Build it strictly with the
   same tokens and components, and list it in `docs/not-from-reference.md`.
3. Viewports: the screenshots are 1080 px wide (DPR 3). The design width is 360 CSS px:
   auth screens are 360x780 CSS px and in-app screens are 360x800. Build mobile-first at
   360px, then scale up gracefully for larger screens without altering the
   360px look.
4. Measure, don't guess. Before writing CSS for a screen, analyse the image
   (use a script, for example Python + Pillow, to sample exact hex colours and measure
   element sizes, margins, paddings, radii and font sizes in px). Record the
   results in client/src/styles/tokens.css and docs/ui-measurements.md and
   reuse those tokens everywhere. Do not eyeball values. Both a LIGHT and a DARK
   token set are required for the in-app screens (see the Settings screenshots).
5. Assets: use the exact logos, icons and fonts supplied in ./reference-ui/assets/
   (logo-spacebasic-transparent.png, logo-presidency.png, avatar-default.png and the traced SVG icons). Use them
   as-is. Do not redraw, recolour, approximate or substitute them. If an asset is
   missing and can't be derived from the screenshots, STOP and ask me instead of creating a lookalike.
   Icons: Phosphor (`@phosphor-icons/react`, MIT) is the single icon set, each icon imported from its
   own path (weights and sizes are in docs/ui-measurements.md). Icons that no library matches (16 icons
   plus the camera glyph) are potrace-traced SVG cut-outs in reference-ui/assets/icons/cutout/
   (fill="currentColor"). Never use Tabler and never mix sets. potrace (GPL-2.0) is a dev-time tool in
   tools/ui-analysis only: it must never appear in client/ or server/ package.json. The font is
   Plus Jakarta Sans.
6. Ignore OS chrome in the screenshots (status bar with time, battery, network
   speed, WhatsApp notification icon, home-indicator bar). Those are not part of
   the app UI. Likewise, the personal data and device values shown (name, phone,
   email, room, app version, device model, device ID) are sample content and must
   come from the database or the real device.
7. Visual regression is mandatory. For each screen:
   a. Set up Playwright with the matching viewport and DPR.
   b. Render the screen with the same sample data as the screenshot.
   c. Crop the reference screenshot to exclude the status bar and navigation
      bar, then pixel-diff against it (pixelmatch).
   d. Show me the reference, my render and the diff image side by side, plus
      the mismatch percentage.
   e. A screen is done when layout, colours, spacing and icons match and only text-edge
      rendering differences remain (target under 1%; up to about 3% is acceptable when only text or edge rendering differs; flag anything above), and I have approved it.
      Run Playwright inside the official Linux Docker image with `--font-render-hinting=none`. Keep the exact screenshot data
      (name, phone, email) in a gitignored fixture folder and commit only a fake equivalent. The raw screenshots in reference-ui/*.png contain the same personal data and are gitignored too.
8. When unsure about any visual detail, ask me. Never silently choose.
9. Any later change (new feature, refactor, dependency upgrade) must keep the
   existing screens visually identical. Re-run the visual regression tests
   after every change that touches the frontend.

## PHASED DELIVERY: PHASE 1 SCOPE (overrides the "stop and ask" rules above for the items below)

The app will be built and deployed in phases. Phase 1 covers ONLY the screens I supplied, plus the minimum supporting flows. The screens I have not supplied will be developed one by one AFTER Phase 1 is deployed, each with its own screenshots and the same pixel-perfect constraint. For Phase 1, do NOT stop and ask about the items below. Use these defaults:

1. Unsupplied module screens (Leave Manager, Tickets, Announcements, Mess Manager, My Information, Accessibility, Check connection, Clear stored data):
   - Keep every entry point exactly as it appears in the screenshots (app icons on Home, Quick Action chips, Profile rows, Settings rows). Do not remove or hide them.
   - Tapping one opens a single reusable `ComingSoon` placeholder screen: standard header with back button and the module's title, and one centred line "Coming soon". Use the existing tokens, no new styling, and support both light and dark themes.
   - Do NOT build backend endpoints, schemas or business logic for these modules yet. Do not design these screens from imagination.
   - Exception (working already in the screenshots, so build the real thing): the Notifications list can show the notification types seen (Attendance Marked, New Announcement, Leave Request Submitted, Leave Partially Approved, Leave Approved). Notifications are created by the system in Phase 1 only where the feature exists (Attendance Marked via QR scan). The others are seeded sample data in dev.
   - Settings > "Clear stored data" in Phase 1: build the row exactly as in the screenshot. Its action signs the user out and clears cached files and saved data, with a plain confirm dialog using the existing components. "Check connection" and "Accessibility" open the ComingSoon placeholder.
2. Third Quick Action chip (cut off as "Bo…" on Home): render it as "Book meal" with the same chip style, opening the Mess Manager ComingSoon screen. Keep the label in one config constant so I can change it in one place later.
3. Supporting flows that must exist for the supplied screens to work but have no screenshot (OTP entry, Forgot password, Change Password, Privacy & Consent, My Information is NOT included): build them with the same tokens and components, as plainly as possible, and list each one in `docs/not-from-reference.md` so I can send the real screenshots later. Do not stop and ask.
4. (For screens, superseded on 2026-11-08 by "Staff screens (free design)".) In Phase 1 the roles needed are `student`, `warden` (for scanning QR codes and marking attendance) and `institution_admin` (to pre-register users, rooms and basic content). Define the full role list in the schema but only implement what Phase 1 uses.
5. Phase 1 backend modules: Auth, Users/Profile, Consent, Hostel/Floor/Room, Notifications, QR/Attendance, Support (contacts and FAQ read endpoints), Settings-related endpoints only if needed. Later phases add Leave, Tickets, Announcements, Mess, then the rest. Design schemas and the API plan so these can be added without breaking changes (versioned `/api/v1`, module-per-folder).
6. All the other rules (pixel-perfect, security, visual regression, runnable checkpoints) still apply in full to every student screen built in Phase 1. Staff screens follow "Staff screens (free design)".

### Staff screens (free design; user decision, 2026-11-08)
1. The pixel-perfect rule applies to student screens only.
2. Warden and institution_admin screens are designed freely, with no reference screenshots:
   - Reuse the existing tokens, Plus Jakarta Sans, icons and shared components, in light and dark.
   - Admin screens must work well on desktop widths as well as phones. Warden screens are phone-first.
   - Each role lands on its own home after sign-in. Staff don't get student screens and students never get staff screens. The server rules stay as they are.
   - Functional tests only (no visual diff tests for staff screens). Every staff screen is listed in `docs/not-from-reference.md` as "free design".
3. Scope:
   - Warden: QR scanner, today's attendance list, student and room lookup.
   - Admin: summary home, users (search, add, edit, roles, CSV import), hostel structure with rooms and beds, support contacts and FAQs, audit log view.
4. Order: finish the remaining student screens first (Support, My Profile with the real Sign Out, Entry Pass, Settings), then build the staff screens. Stop at a checkpoint after each group.

## DECISIONS ALREADY MADE
- TypeScript strict on client, server and shared; zod for validation; npm workspaces.
- Font: Plus Jakarta Sans. Wordmark: text in PJS 800. App logo (`logo-spacebasic-transparent.png`) and Presidency logo used as supplied.
- Icons: Phosphor is the single set (MIT, per-icon imports). The 16 icons it can't match, plus the camera glyph, are potrace-traced SVG cut-outs (see `docs/ui-measurements.md`). Not Tabler.
- Default avatar: `reference-ui/assets/avatar-default.png` (cropped from the Profile screenshot), used on the Home tab bar, Profile card and Entry Pass. The camera badge is a SEPARATE component on the Profile card only (22 px blue disc #4A5CE6, 2 px ring in `var(--surface-card)`, right/bottom -4px, white camera glyph from `reference-ui/assets/icons/cutout/camera.svg` in a 14 px box; the light-card ring colour is provisional until a light Profile screenshot is supplied; tapping it opens photo upload). The avatar renders at exactly 66 CSS px with no border-radius (the file is already a circle), and an uploaded photo replaces it.
- Themes: auth screens light; in-app dark and light, chosen in Settings > Appearance.
- Phase 1 only: supplied screens, with ComingSoon placeholders for the rest. Staff (warden and admin) screens are free design (see "Staff screens (free design)"); the seed and CSV import scripts stay. QR generator and scanner libraries must be free and open source; name them in `docs/decisions.md`.
- Tests: mongodb-memory-server for the backend, vitest on the client, Playwright visual tests in Docker.

## WORKFLOW (GO MODE with runnable checkpoints)
1. Analyse requirements and the screenshots. Summarise the screens, modules and roles you see, and list your open questions.
2. Propose the architecture: folder structure, data flow, auth flow, RBAC matrix, multi-tenancy approach.  (write it to docs/, no approval gate)
3. Design the Mongoose schemas and indexes.  (write it to docs/, no approval gate)
4. Plan the REST API (endpoint table: method, path, role, request/response shape).  (write it to docs/, no approval gate)
5. Backend, one module at a time. After each module, write and run tests (Jest + Supertest) and show me the results.
6. Frontend, one module at a time, matching the screenshots.
7. Integrate frontend and backend.
8. PWA features.
9. Security and functional testing (rate limiting, helmet, NoSQL-injection sanitising, CORS, RBAC tests, an OWASP-style checklist).
10. Deployment: Vercel + Render + Atlas, with production env vars and CORS locked to the deployed frontend.

Phase 1 module order: Auth, Users/Profile, Consent, Hostel/Floor/Room, Notifications, QR/Attendance, Support/FAQ. Leave, Tickets, Announcements and Mess come in later phases.

### Go mode and checkpoints
1. Steps 2, 3 and 4: write `docs/architecture.md`, `docs/schemas.md` and `docs/api.md` in one go and continue.
2. Decide anything that has a default in `CLAUDE.md`, `docs/decisions.md` or this file, note it in `docs/decisions.md`, and continue.
3. Stop and ask ONLY if: something costs money; a secret or account is needed from me (MongoDB URI, Gmail credentials); an asset is missing and can't be derived; a screen would need new visuals not covered by the ComingSoon rule; or a visual diff is above the agreed limit and can't be fixed.
4. After every big change, make the app runnable and STOP for my reply. Each checkpoint gives: one command from the project root that starts client and server (with URLs); seeded fake test users (student, warden, institution admin) with their logins; email + password login working locally, with OTPs printed in the server console; a short "what to try" list; and a summary (built, tests passed, flagged items, what doesn't work yet). Don't start the next module until I reply "continue" or give feedback.

## UI SPECIFICATION (derived from the screenshots)

### Design tokens
- Primary: royal blue, about `#3748D6`. Sample exact values from the screenshots and put them in CSS variables.
- Font: a clean geometric sans (the screenshots look like Plus Jakarta Sans or Outfit). Decided: Plus Jakarta Sans, self-hosted, confirmed by pixel diff (fall back to Manrope, Figtree or DM Sans only after showing me the comparison).
- Large rounded corners (cards about 20-24px, pills fully rounded). Soft shadow glow under the primary button.
- The auth screens (welcome, sign-in) are light. The logged-in app has BOTH a dark theme (near-black navy background, card surface slightly lighter navy) and a light theme (white cards on a very light grey-blue background), as shown in the two Settings screenshots (`settings-dark`, `settings-light`). The theme is chosen under Settings > Appearance (System / Light / Dark). "System" follows the phone's light/dark setting. Build both token sets from the screenshots.

### Screen 9: Settings (dark and light variants)
- Reached from My Profile > Settings. Header: back chevron + title "Settings".
- Card "ABOUT THIS APP" (read-only rows with hairline dividers): App version, Web bundle (long build id, wraps onto two lines, right-aligned), Last updated (format "3 Nov 2026, 1:52 PM"), Operating system, OS version, Device, Model, Device ID. Values come from the real device and build (build-time version and bundle id, user-agent/Capacitor-style device info where available), not hard-coded. When a value can't be read in a browser, show "Unknown". Device ID is a random ID generated per install and stored locally.
- Card with "Appearance" + small "BETA" pill, subtitle "System matches your phone's light or dark setting", and a 3-way segmented control: System | Light | Dark (selected segment is a raised pill; in light theme the selected label is blue). Persist the choice.
- Toggle row "Haptic feedback": "Vibrate on taps, and on success or failure" (default on).
- Toggle row "Sounds" + "BETA" pill: "A short chime on success or failure; follows your silent switch" (default on).
- Card of link rows with a tinted rounded-square icon and chevron: "Accessibility: Text size, motion, contrast and messages"; "Check connection: Tests whether the app can reach SpaceBasic, and how fast"; "Clear stored data: Signs you out and deletes cached files and saved data" (red/pink icon and tint).
- The screenshots are scrolled mid-page. The rest of the page (and the Accessibility, Check connection and Clear stored data sub-screens) is not supplied: Accessibility and Check connection open the ComingSoon placeholder, and Clear stored data is a real action (see the Phase 1 scope).

### Screen 1: Welcome
- Top blue panel with rounded bottom corners and a large translucent circle in the top-right corner.
- White pill containing the Space Basic logo and the wordmark "spacebasic". Use the supplied logo file `./reference-ui/assets/logo-spacebasic-transparent.png` (Space Basic app logo: stacked blue / yellow / red pill-shaped "S" mark; made from the original JPEG, which had a white background). Do NOT redraw or recolour it. Cropping its whitespace and removing the white background are allowed (about 4% mismatch on the logo pill is accepted). The wordmark "spacebasic" is text in Plus Jakarta Sans 800, kept diffed against the screenshot.
- Four circular icon badges in a staggered row: mint green (bed), yellow (fork and knife), light blue (wallet), pink (chat bubble).
- Headline: "Seamless campus living." Subtitle: "Hostel, mess, fees and requests — in one app."
- Filled primary button "Continue with email"; outlined button "Continue with mobile".
- Footer: "Privacy Policy · Terms & Conditions" (links).

### Screen 2: Sign in (Mobile tab)
- Circular back button, title "Sign in", subtitle "We'll send a four-digit code to your phone."
- Segmented toggle Email | Mobile (Mobile active).
- Label "Mobile number", input placeholder "98765 43210" (Indian 10-digit; format as 5+5).
- Link "Send it on WhatsApp instead".
- Consent card with a checkbox: "I allow SpaceBasic to collect and use my personal data for hostel management under DPDPA 2023, as described in our Privacy Policy. SpaceBasic acts as a data processor. Withdraw anytime via Settings." Link below: "Read the Privacy Policy".
- Bottom button "Send code" is disabled until the box is ticked; helper text under it: "Tick the consent box above to continue".
- Next screen (build it too): a 4-digit OTP entry with resend timer.

### Screen 3: Sign in (Email tab)
- Subtitle: "Use the email address your college registered you with."
- Email field (placeholder "name@college.edu"), Password field with show/hide eye icon, "Forgot password?" link on the right of the label.
- Link "Email me a one-time code instead".
- Same consent card, then "Log in" button (disabled until consent is ticked).
- Build Forgot password and the email OTP flow as well.
- Only users pre-registered by the college can sign in. No public self-signup.

### Screen 4: Home (dark)
- Blue header: institution logo + institution name in uppercase (for example "PRESIDENCY UNIVERSITY", loaded from the institution record, since the app is multi-institution). The Presidency University logo is supplied as `./reference-ui/assets/logo-presidency.png` (dark navy open book with flying birds, on white): upload it as the institution's logo and display it exactly as in the screenshot (white rounded-square tile, logo centred), never redrawn, greeting "Good evening, {FIRST NAME}" (Morning/Afternoon/Evening by local time) and the date as "Tuesday 3 November".
- "QUICK ACTIONS": horizontally scrollable chips: Apply for leave, Raise a ticket, Book... (the third chip is cut off in the screenshot; it is "Book meal", kept in one config constant, and opens the Mess Manager ComingSoon screen).
- "APPS": one rounded card with a 4-icon grid: Leave Manager, Tickets, Announcements, Mess Manager. Apps shown depend on the modules enabled for the institution and the user's role.
- Bottom tab bar: Home, Notifications (red badge, capped display "99+"), Support, My Profile (user avatar). The active tab has a coloured top indicator bar and a highlighted icon/label.

### Screen 5: Notifications
- Title "Notifications", list grouped by date headers ("25 OCT 2026", uppercase, letter-spaced).
- Row: unread blue dot, title, time (07:24 PM), right chevron. Read rows have no dot.
- Types seen: Attendance Marked, New Announcement (with a 👋 prefix), Leave Request Submitted, Leave Partially Approved, "Great News: Leave Approved".
- Tapping a row deep-links to the related item. Opening marks it read. Infinite scroll or pagination. Push notifications via the Web Push API (ask me before adding it).

### Screen 6: Support / Help
- Title "Help", subtitle "Answers to the questions that come up most, and a person for everything else."
- Primary blue card "Contact us: Reach your hostel office or SpaceBasic." with a phone icon and an arrow (shows hostel office contacts and SpaceBasic support contacts).
- Card "Common questions: Leave, tickets, announcements and signing in" (FAQ list, managed by admin).
- Muted line with a video icon: "Video tutorials are on the way."

### Screen 7: My Profile
- Header card: avatar with a camera badge (photo upload), uppercase full name, room chip with a bed icon (for example "West CS240" = block + room), phone, email.
- Inside the card: "Show my QR code: Attendance, amenities and check-in" row with a QR icon and chevron.
- ACCOUNT group: My Information, Change Password, Privacy & Consent.
- APP group: Settings, About.
- Red "Sign Out" button at the bottom (scrolls into view).
- Privacy & Consent: view the consent given, with a timestamp and policy version, and a withdraw option (DPDPA 2023).

### Screen 8: Entry Pass (QR bottom sheet)
- Bottom sheet over the dimmed profile: label "ENTRY PASS", name, room in the accent colour, close X button.
- White rounded card with the QR code. A circular countdown with "Expires in 9s". The QR auto-refreshes every 10 seconds.
- Footer text: "Scanned for attendance, amenities and check-in."
- Security: the QR payload is a short-lived signed token (JWT or HMAC, about 10-15 s TTL, single-use or replay-protected, bound to the user). It never contains plain personal data. The backend verifies it when a warden or staff member scans it, and a successful attendance scan creates an "Attendance Marked" notification for the student.

## DOMAIN MODEL (to refine at the schema gate)
- Roles: `student`, `warden`, `mess_staff`, `institution_admin`, `super_admin` (Space Basic staff). Phase 1 implements student, warden and institution_admin.
- Entities: Institution (name, logo, enabled modules), Hostel/Block, Room, User, Consent (version, timestamp, withdrawn), OTP (hashed, TTL index), LeaveRequest (supports partial approval and a multi-step approval status), Ticket (category, status, comments), Announcement (audience targeting, 'new' push), MessMenu/MessBooking, Notification, AttendanceLog, FAQ, SupportContact, RefreshToken/Session.
- Hostel layout: there is ONE block, "West", with three floors. Room codes are the floor prefix plus a room number: `CF` = first floor, `CS` = second floor, `CT` = third floor (example: `CS240` is shown on the profile as "West CS240"). Model this as Hostel -> Floor (code, name) -> Room, and validate room codes against this pattern. Keep it data-driven so more blocks or floors can be added later without code changes. Room number ranges and beds per room are data. Current placeholder seed values (fake until I confirm the real ones): CF101–CF200, CS201–CS300, CT301–CT400, 3 beds per room. Record any change in `docs/decisions.md`.
- Everything is scoped by `institutionId`, so one institution can never read another's data. Enforce this in a query helper or middleware and test it.

## SECURITY REQUIREMENTS
- Sessions: 15-minute access token kept in memory only, plus a rotating refresh token in an httpOnly, Secure, SameSite=Lax cookie (30 days sliding, 90-day hard cap; reuse of an old refresh token revokes the whole session). `/api/*` goes through a Vercel rewrite to Render so the cookie is first-party. Email and phone are unique across all institutions (phone normalised to E.164).
- OTP: 4 digits, hashed at rest, 5-minute expiry, max attempts, resend cooldown, rate limited per phone/email/IP.
- OTP delivery (no paid services): one `OtpDelivery` interface selected by `OTP_PROVIDER`. `console` is refused when NODE_ENV=production unless ALLOW_CONSOLE_OTP=true (demo with fake users only). `gmail-api` (Gmail API over HTTPS with OAuth2) is the production email provider. `gmail-smtp` (Nodemailer, App Password) is for local development only. Mobile and WhatsApp OTP use `console` only for now. In production, email + password login must work without any OTP provider.
- helmet, express-rate-limit, input sanitising against NoSQL injection, CORS allow-list from env, request size limits.
- Generic auth error messages (no user enumeration).
- Audit log for sensitive actions (approvals, role changes, consent withdrawal).

## PWA REQUIREMENTS
- Web app manifest (name "Space Basic", standalone display, theme colour from the tokens), icons 192/512 plus a maskable icon.
- Service worker (use vite-plugin-pwa, MIT): precache the app shell and static assets. NEVER cache authenticated API responses or the QR in a way that leaks data after logout.
- Installable on Android (Add to Home Screen prompt UI) and desktop.
- Clear online/offline indicator, and friendly offline screens for actions that need a connection.
- Lighthouse PWA and accessibility checks before deploy.

## DEPLOYMENT
- Frontend on Vercel (SPA rewrite config), backend on Render (health check endpoint, start command, env vars), database on MongoDB Atlas (least-privilege DB user, network access configured for Render).
- Separate `.env.development` and `.env.production` setups. Document every variable in `.env.example`.
- CORS restricted to the deployed frontend origin in production.

## DELIVERABLES
- A running app that matches the screenshots.
- `README.md` with setup, scripts, env var table and deployment steps.
- API documentation (OpenAPI/Swagger or a markdown endpoint table).
- Seed script (dev only) that creates one demo institution, one hostel, a few rooms and sample users for each role with FAKE data.

## START NOW
Asset preparation is done. Proceed from step 2 under "Go mode and checkpoints": write the architecture, schema and API docs in one go, then build Phase 1 module by module with runnable checkpoints. Stop only for the conditions listed there.
