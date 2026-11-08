# Built without a reference screenshot

The rule (SPEC.md): anything functionally required but not shown in `reference-ui/` is built as plainly as possible from the existing tokens and components, and listed here so it can be replaced when a real screenshot arrives.

## Auth screens (step 6, first checkpoint, 2026-11-08)

| What | Where | How it's built | Replace when |
|---|---|---|---|
| Consent checkbox, **ticked** state | Sign in, both tabs | Primary-blue fill (#384BD5), no ring, white Phosphor `Check` (bold, 12 px) | A screenshot with the box ticked |
| Primary button, **enabled** on Sign in ("Log in", "Send code") | Sign in | The Welcome primary button style (blue fill and glow) | A screenshot after ticking consent |
| Helper "Tick the consent box above to continue" **hidden** once ticked | Sign in | Removed from the page; nothing replaces it | Same screenshot |
| Password **visible** state | Sign in, Email tab | Phosphor `EyeSlash` (same size and colour as `Eye`) | A screenshot with the password shown |
| Input **focus** ring | All text fields | The 2 device px ring in primary blue instead of grey | A screenshot of a focused field |
| Typed **values** in fields | All text fields | 15.1 px / 500, #13161F (the placeholder style, darker) | A screenshot with text entered |

| Sign-in **error** message | Sign in, Email tab | The server's message in the helper line's place and style (e.g. "We couldn't sign you in with those details.") | A screenshot of a failed sign-in |
| **Loading** state while the session is restored | All screens on start | The plain page background (the API may take up to a minute to wake) | A screenshot of a loading state |

## Home and in-app (step 6, second checkpoint, 2026-11-08)

| What | Where | How it's built | Replace when |
|---|---|---|---|
| **ComingSoon** screen | Apps, Quick Actions, and (temporarily) some My Profile rows (below) | Header from the Settings screenshot (back chevron, 22 px title, divider), one centred "Coming soon" | Each module's screenshot; the three tabs are supplied screens built at the next checkpoints |
| **Light** Home | Home in light theme | Settings-light colours for page, cards, text; tiles, accent and tab bar provisional | A light Home screenshot |
| Institution with **no logo** | Home header | The white tile, empty | A screenshot of that case |

## One-time codes and Forgot password (step 6, third checkpoint, 2026-11-08)

SPEC.md asks for these flows without a screenshot. Every screen reuses the Sign in layout (back button, 25.4 px title, subtitle, primary button pinned to the bottom, helper line under it) and the existing components; the only new component is the code boxes.

| What | Where | How it's built | Replace when |
|---|---|---|---|
| **Code entry** screen: "Enter the code" / "We sent a four-digit code to {email, +91 98765 43210, or +91 98765 43210 on WhatsApp}." | `/sign-in/code`, from "Send code", "Send it on WhatsApp instead" and "Email me a one-time code instead" | Four 56 px boxes in the text-field style (fill, 2 device px ring, 14 px radius, primary ring on the next box), digits in 25.4 px / 500. One real input underneath (paste, SMS autofill, screen readers). The fourth digit submits; "Log in" also does | Screenshots of the OTP screen |
| **Resend timer**: "Resend code in 0:30", then the "Resend code" link | Code screens | Text-link line (12.2 px / 500): subtitle grey while counting, link blue when ready | Same |
| **Wrong / expired code** | Code screens | "That code is wrong or has expired. Check it, or ask for a new one." in the helper line; the boxes clear | A screenshot of that state |
| **Limit messages** | Sign in and code screens | The server's "Too many attempts. Please wait a moment and try again." For waits over 90 s: "Too many attempts. Please try again in N minutes." | Same |
| **Forgot password** screen: "Reset your password" / "We'll email a four-digit code to the address your college registered you with.", Email field, "Send code" | `/forgot-password`, from "Forgot password?" (the typed email carries over) | Sign in layout and TextField | A Forgot password screenshot |
| **Reset** screen: code boxes, resend timer, "New password" (placeholder "At least 8 characters", eye toggle), "Reset password" | `/forgot-password/code` | Same components | Same |
| **Password changed** confirmation: "You've been signed out on every device. Log in with your new password.", "Back to sign in" | After a reset | Title, subtitle and primary button only | Same |
| A **code link tapped before consent** | Sign in | Nothing is sent; focus moves to the consent checkbox (its helper line already says to tick it) | A screenshot of that state |
| **Invalid email or number** before a code is sent | Sign in, Forgot password | The shared zod message ("Enter a valid 10-digit mobile number", "Enter a valid email address") in the helper line | A screenshot of that state |

## Notifications (step 6, fourth checkpoint, 2026-11-08)

The list itself matches `05-notifications.png` (0.90%). Only these states have no screenshot:

| What | Where | How it's built | Replace when |
|---|---|---|---|
| **Empty** list: "No notifications yet" | Notifications | The ComingSoon line style (14 px, secondary text), below the header | A screenshot of an empty list |
| **Error** when the list can't load | Notifications | The API's message in the same line | A screenshot of that state |
| **Loading** and **loading more** | Notifications | Nothing extra: the header shows first, rows appear when loaded; more load before the end scrolls into view | Same |
| **Light** Notifications | Light theme | Settings-light colours; the chevron colour (#B4B8C3) is provisional | A light Notifications screenshot |
| **Pressed** row | Notifications | No pressed style | A screenshot or video of a tap |
| Long titles | Notifications | One line, cut with "…" | A screenshot with a long title |

## Help sub-screens (step 6, fifth checkpoint, 2026-11-08)

Help itself matches `06-contact-support.png` (0.98%). What it opens has no screenshot:

| What | Where | How it's built | Replace when |
|---|---|---|---|
| **Contact us** screen | `/support/contact`, from the "Contact us" card | The Settings header (back, title "Contact us"); Home's section labels "HOSTEL OFFICE" and "SPACEBASIC"; one card per group (radius 20, 1 px ring, rows split by 1 px lines). Each row: label 14 / 500, hours 12 / 400 secondary, then `tel:` and `mailto:` links in the accent colour with Phosphor Phone and EnvelopeSimple (15 px). Phones show as "+91 98765 43210" | A Contact us screenshot |
| **Common questions** screen | `/support/faqs`, from the "Common questions" card | Same header and section labels (LEAVE, TICKETS, ANNOUNCEMENTS, SIGNING IN, OTHER; empty ones hidden). Each question is a row (14 / 500) with a CaretRight that turns down when open; the answer shows below in 13 / 400 secondary text | A Common questions screenshot |
| **Empty** and **error** states | Both sub-screens | "No contacts yet" / "No questions yet", or the API's message, as one centred line | Screenshots of those states |
| **Light** Help | Help in the light theme | Same blue card and glow (glow alpha 0.22, provisional) on the light page | A light Help screenshot |

## My Profile (step 6, sixth checkpoint, 2026-11-08)

My Profile matches `07-profile.png` (1.14%) and `07-profile(1).png` (1.11%). Not in the screenshots:

| What | Where | How it's built | Replace when |
|---|---|---|---|
| Rows that open **ComingSoon** for now | My Information (Phase 1 placeholder), About (no screenshot) | The shared ComingSoon screen with the row's title | Each screen as it's built |
| **Photo upload** states | Camera badge | No preview or progress UI: the new photo appears when the upload ends. A refused file (type, size) shows the API's message in small danger-coloured text under the avatar | A screenshot of an upload |
| **Sign Out** confirmation | Sign Out row | None: it signs out at once, as the screenshot offers no dialog | A screenshot of a confirm step, if there is one |
| A user **without a room**, phone or email | Profile card | That line is left out | A screenshot of such a profile |
| Long names and emails | Profile card | One line, cut with "…" | A screenshot with a long value |
| **Light** My Profile | Light theme | Settings-light colours; Sign Out pink, its tile, the QR panel's subtitle and chevron colours are provisional | A light Profile screenshot |

## Entry Pass (step 6, seventh checkpoint, 2026-11-08)

The Entry Pass matches `QR_entry-pass.png` (0.70%). Not in the screenshot:

| What | Where | How it's built | Replace when |
|---|---|---|---|
| **Opening and closing** | The sheet | Slides up from the bottom while the scrim fades in (280 ms); the X, Escape, Android back and a tap on the dimmed profile slide it down. No animation with reduced motion | A recording of the real sheet |
| **First code loading** | Sheet just opened | The white card is empty and the countdown row is blank until the first code arrives (normally well under a second) | A screenshot of that moment |
| **Can't refresh** | Countdown row | When no valid code is on screen (offline, server waking up), the card is empty and the row reads "Can't refresh your pass. Trying again…" (14 / 400, secondary); it keeps retrying every 2 s | A screenshot of the offline state |
| **Pass not available** | Countdown row | A refusal from the server (for example the attendance module switched off) reads "Your entry pass isn't available. Ask your hostel office." and stops retrying | A screenshot of that state |
| A student **without a room** | Under the name | The room line is left out | A screenshot of such a pass |
| **Light** Entry Pass | Light theme | White sheet (`--surface-card`), the same scrim; close disc #EEF0F5, ring track #E8E7EC and a 2 device px #E8E7EC ring around the white QR card (a white card on a white sheet needs an edge) are provisional | A light Entry Pass screenshot |

| Entry point | Plan |
|---|---|
| "Privacy Policy", "Terms & Conditions" (Welcome footer), "Read the Privacy Policy" (Sign in) | Plain text pages from the same tokens, or ComingSoon, at a later checkpoint |

## Role routing and staff homes (step 6, staff group (a), 2026-11-09)

**Free design**: staff screens have no screenshots by decision (2026-11-08); they reuse the tokens, Plus Jakarta Sans, Phosphor icons and shared components, in light and dark. Functional tests only (`tools/ui-analysis/src/smoke-roles.ts`).

| What | Where | How it's built | Status |
|---|---|---|---|
| **Staff shell** | Every warden and admin page | Header: institution logo on a white tile, institution name (section-label style), the app's name ("Warden" / "Admin"), and an account button (avatar + caret) whose menu shows the name, email, "Switch to …" (only with two or more roles) and Sign out. Admin: sidebar of sections from 960 px, a scrolling strip on phones | free design |
| **Warden home** | `/warden` | Greeting with the first name and the date (as Home's), then three cards: Scan entry passes, Today's attendance, Find a student or room | free design |
| **Admin home** | `/admin` | The same greeting, then cards for Users, Hostel, Support and Audit log (2 columns from 720 px, 3 from 1200 px). The summary numbers come with the admin checkpoint | free design |
| Staff **section pages** | `/warden/scan`, `/warden/attendance`, `/warden/lookup`, `/admin/users`, `/admin/hostel`, `/admin/support`, `/admin/audit` | Title (with a back link on warden pages) and "Coming soon", until their checkpoints | placeholder |
| **Continue as** | `/choose`, accounts with two or more roles | Title, one line of explanation, one card per app the account has (icon tile, name, one line, chevron), Sign out | free design |
| **Nothing here yet** | `/no-access`, an account whose roles have no app yet (mess staff) | Title, one line, Sign out | free design |
| **"Switch role" row** in My Profile | Student app, **only** for accounts with two or more roles | One more row at the end of the APP list, the same row style, Phosphor ArrowsLeftRight 20 in the tile; opens "Continue as". Single-role students (the screenshot's case) don't get it, so their My Profile is unchanged (visual test 1.14% / 1.11%) | not in the screenshot |

## Settings, Change Password, Privacy & Consent (step 6, 2026-11-09)

Settings matches `settings-dark.png` (0.93%) and `settings-light.png` (1.04%). Not in the screenshots:

| What | Where | How it's built | Replace when |
|---|---|---|---|
| Switches **off** | Haptic feedback, Sounds | Knob on the left, track #3A3E49 (dark) / #D5D8E0 (light), provisional | A screenshot with a switch off |
| Segment **separator in light** | Appearance | #E2E4EA, provisional (the light screenshot has Light selected, so none shows) | A light screenshot with System or Dark selected |
| The link card **in dark** | Accessibility, Check connection, Clear stored data | My Profile's dark row style: tile #1E2140 with #8B96FF icons, the danger tile and colour, chevron #494F5D | A dark screenshot scrolled to the end |
| **Accessibility**, **Check connection** | Their rows | The shared Coming soon page (Phase 1 scope) | Their screenshots |
| **"Clear stored data?"** confirm | Clear stored data row | A plain dialog: title, one line, Cancel and "Clear and sign out" (danger) | A screenshot of the real confirm |
| **Change Password** screen | `/profile/password` | Settings header and card; three password fields (current, new, again) on the segmented-track colour, a rules line, "Show passwords", a primary button; "Password changed" card with Done | A Change Password screenshot |
| **Privacy & Consent** screen | `/profile/privacy` | A card with the consent statement, when it was given and the policy version; a History card when there's more than one record; "Withdraw consent" (danger) with a confirm | A Privacy & Consent screenshot |
