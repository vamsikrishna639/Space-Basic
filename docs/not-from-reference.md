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

| Entry point | Plan |
|---|---|
| "Privacy Policy", "Terms & Conditions" (Welcome footer), "Read the Privacy Policy" (Sign in) | Plain text pages from the same tokens, or ComingSoon, at a later checkpoint |
