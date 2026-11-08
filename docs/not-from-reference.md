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

## Not built yet (links that go nowhere at this checkpoint)

| Entry point | Plan |
|---|---|
| "Privacy Policy", "Terms & Conditions" (Welcome footer), "Read the Privacy Policy" (Sign in) | Plain text pages from the same tokens, or ComingSoon, at a later checkpoint |
| "Forgot password?", "Email me a one-time code instead", "Send it on WhatsApp instead" | The Forgot password and OTP flows (SPEC.md, Phase 1 supporting flows) |
| "Log in", "Send code" | Wired to `/api/v1/auth` with the Home screen at the next checkpoint |
