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
| **ComingSoon** screen | Apps, Quick Actions, and (temporarily) the Notifications, Support and My Profile tabs | Header from the Settings screenshot (back chevron, 22 px title, divider), one centred "Coming soon" | Each module's screenshot; the three tabs are supplied screens built at the next checkpoints |
| **Sign Out** on the My Profile placeholder | `/profile` | The outline button, TEMPORARY so you can sign out | The real My Profile screen (its red "Sign Out" button) |
| **Light** Home | Home in light theme | Settings-light colours for page, cards, text; tiles, accent and tab bar provisional | A light Home screenshot |
| **Active** Notifications / Support / My Profile tabs | Tab bar | Phosphor `fill` weight for bell and headset, accent ring around the avatar | Screenshots with those tabs active |
| Institution with **no logo** | Home header | The white tile, empty | A screenshot of that case |


| Entry point | Plan |
|---|---|
| "Privacy Policy", "Terms & Conditions" (Welcome footer), "Read the Privacy Policy" (Sign in) | Plain text pages from the same tokens, or ComingSoon, at a later checkpoint |
| "Forgot password?", "Email me a one-time code instead", "Send it on WhatsApp instead" | The Forgot password and OTP flows (SPEC.md, Phase 1 supporting flows) |
| "Send code" (Mobile tab) | The OTP entry screen (four digits, resend timer) at the next checkpoint. "Log in" (email + password) works |
