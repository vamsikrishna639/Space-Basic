# UI measurements

Measured from the screenshots in `reference-ui/`; nothing here is estimated by eye. The analysis scripts are in `tools/ui-analysis/src/` and write their outputs to `tools/ui-analysis/out/`, which is gitignored.

Status labels:
- **FINAL**: approved, or measured with no open question
- **PENDING**: waiting for a decision

## 1. Canvas

| | Screenshot px | DPR | CSS viewport |
|---|---|---|---|
| Auth screens (01–03) | 1080 × 2340 | 3 | 360 × 780 |
| In-app screens (04–07, QR, Settings) | 1080 × 2400 | 3 | 360 × 800 |

The prompt said 540/720 px wide. The real files are 1080 px wide, so DPR is 3 and the design width is still 360 CSS px.

## 2. Font: Plus Jakarta Sans (FINAL)

- **Family:** Plus Jakarta Sans, variable weight axis.
- **Package:** `@fontsource-variable/plus-jakarta-sans`, Latin subset only, self-hosted.

**How it was checked.** I compared 17 text crops (Welcome and Settings) against Plus Jakarta Sans, Manrope, Figtree and DM Sans:

1. Font size was fitted from ink width. For all-caps or tracked text, it was fitted from ink height, with tracking taken from the width.
2. Weight was fitted by matching ink mass, then each neighbouring standard weight was scored.
3. Each render was aligned by its ink bounding box and scored with pixelmatch (threshold 0.1, anti-aliasing detection on).

**Result.**

| Font | Best match on | Mean ink mismatch |
|---|---|---|
| Plus Jakarta Sans | **16 of 17** | **21%** |
| Figtree | – | 35% |
| DM Sans | – | 37% |
| Manrope | – | 40% |

The sheets are `font-comparison.png` and `font-pjs-diff.png`.

**What the % values mean.** "Ink %" is mismatched pixels divided by every pixel inked in either image. It is deliberately strict: on 12–14 px text, almost all of what remains is glyph-edge rasterisation.

**Where the numbers come from.** All numbers below come from Playwright's **Linux Docker image with `--font-render-hinting=none`**, the default in `run-in-docker.mjs`.

- Android does not hint glyphs. Linux headless Chromium does by default.
- With hinting on, the mean mismatch on five probe samples was 24.8%. With hinting off it was 8.6%.
- Windows numbers are not reported.

### Type scale (measured)

| Role (sample) | Size (CSS px) | Weight | Letter-spacing | Colour (dark theme unless noted) | Ink % (Linux) |
|---|---|---|---|---|---|
| Welcome headline "Seamless campus / living." | 30 | 500 | −0.03em | #11151E (light) | 4.9 / 4.5 |
| Welcome subtitle | 17 | 400 | 0 | #6A707E (light) | 10.8 / 10.7 |
| Primary button label "Continue with email" | 15 | 500 | 0 | #FFFFFF on #384BD5 | 32.7* |
| Page title "Settings" | 22 | 500 | 0 | #EEEFF4 | **1.26** |
| Card section label "ABOUT THIS APP" | 10.25 | 700 | +0.13em | #8D909F | 41* (w800: 40.3, a tie; recheck in the Settings visual test) |
| Row label "App version", "Last updated", "Operating system" | 14 | 400 | 0 | #A5A8B9 | 14.7–21.9 |
| Row value "Android", "3 Nov 2026, 1:52 PM", "11.1.1" | 14 | 500 | 0 | #EEEFF4 | 6.5 / 8.2 / 19.4 |
| Row value, IDs ("Device ID", "Web bundle") | 13 | 400, **tabular-nums** | 0 | #A5A8B9 | 22.0 / 26.1 (proportional digits: 56 / 61) |
| Toggle title "Appearance" | 14 | 400 | 0 | #EEEFF4 | 13.6 |
| Toggle subtitle | 12 | 400 | 0 | #A5A8B9 | 24.6 |
| Segmented control label "System" | 13 | 600 | 0 | #EEEFF4 on #20242F | 19.0 |

\* These samples are small or light-on-dark text, where edge rasterisation dominates the score. Their shapes are confirmed visually in `font-pjs-diff.png`.

Measured sizes are within ±0.15 px of the values above. Each one gets a final check in its screen's visual test.

**Auth screens (fitted 2026-11-08, `fontfit.ts` samples `w-*` and `a-*`).** The fitter matches ink mass, so it reports in-between weights (430–470). The app uses the nearest standard weight, and the size is then corrected to the ink width at that weight (a heavier weight is wider, so 12.3 → 12.2 px at 500).

| Role (sample) | Size (CSS px) | Weight | Colour |
|---|---|---|---|
| "Sign in" | 25.4 | 500 | #13161F |
| Sign in subtitle | 14.12, line 21.333 | 400 | #6D717D |
| Buttons, input text and placeholders | 15.1 | 500 | white / #384BD5 / #666666 (disabled); placeholder #6B717F |
| Segmented labels "Email" / "Mobile" | 13.2 | 500 | #13161F on, #6D717D off |
| Field labels, links ("Send it on WhatsApp instead", "Forgot password?") | 12.2 | 500 | #13161F; links #3C4DC4 |
| Consent text, helper | 12.25, line 18.333 | 400 | #6D717D; "SpaceBasic" #13161F 500 |
| "Read the Privacy Policy" (underlined) | 12.25 | 500 | #13161F |
| Welcome footer | 11.3 | 500 | #6D717D |

## 3. Welcome logo pill (FINAL: supplied logo accepted, ~4% known mismatch)

**Decision (user, 2026-11-07).** Use the supplied `logo-spacebasic.png` as-is, with no recolouring or reshaping. Removing the white background is allowed. About 4% mismatch on the logo pill is accepted. If the original SVG turns up, it replaces the file with no code change.

**Asset in use:** `reference-ui/assets/logo-spacebasic-transparent.png`, 920 × 856.

| | Pixels | Treatment |
|---|---|---|
| Background connected to the border | – | Removed (flood fill) |
| Mark interior | 630,033 | Byte-identical to the source, fully opaque |
| Boundary | 14,801 | Partial transparency, unblended from white so it looks the same on white |

On white it differs from the original by at most 8/255, and only where near-white background noise was removed. The original file is kept unchanged.

| Element | Measurement |
|---|---|
| Panel blue | **#384BD5**, the same as the primary button |
| Decorative circle | #4658D8. Centre (295.15, 69.78) CSS px from the top of the screenshot, r 122.16 |
| Pill | Left 19.17, top 81.67 (screenshot coordinates, including the status bar), 192.5 × 50.33. Fully rounded, white, no shadow |
| Logo mark | Ink box left 37.67, top 92.67, 32.33 × 28.33 CSS px |
| Wordmark "spacebasic" | Plus Jakarta Sans 800, 21.03 px, −0.011em, #000000. Ink box left 77.67, top 98.00 |

**Diff results** (Linux image).

| Region | Mismatch |
|---|---|
| Wordmark box | 1.43% |
| **Logo mark box** | **21.7%** |
| Whole pill region | **3.99%**, accepted (limit was 1%) |

**Why the logo mark fails.** The logo in the app is not the supplied `logo-spacebasic.png`:

| | Screenshot | Supplied file |
|---|---|---|
| Aspect ratio | 1.141 | 1.078 |
| Top-left segment | #384BD5 (the app primary) | #0129ED |
| Pink | #FF5770 | #F92D5E |
| Yellow | #FCB201 | #FDBE01 |
| Cyan | #00AAFF | #01A7FB |
| Dark red | #BD001C | #C10212 |

The sheet is `wordmark-pill.png`.

## 4. Icons (FINAL: Phosphor + 17 vectorised cut-outs)

Each screenshot icon was compared with candidates from each library, using the same procedure:
- **Stroke libraries (Lucide, Heroicons):** size fitted to the ink box, stroke chosen so the ink mass matches.
- **Phosphor:** has fixed weights, so every weight was scored.
- **Filled active tabs:** an outline icon filled via CSS, plus the library's solid or fill variant.

Icon numbers are the same on Windows and Linux, because vector shapes rasterise the same way on both. Sheets: `out/linux/icon-comparison-multi.png` (Lucide / Phosphor / Heroicons), `icon-comparison-lucide.png`, `icon-comparison-tabler.png`.

**Best library per icon:**

| Library | Icons won |
|---|---|
| Phosphor | 20 |
| Heroicons | 13 |
| Lucide | 10 |

Heroicons has no bed, utensils, headset, gauge or accessibility icon, so it can't be the one set.

### Decision: Phosphor Icons is the single set (`@phosphor-icons/react` 2.1.10, MIT)

- **Version:** 2.1.10 was tested. Pin that version, or re-run this comparison before upgrading.
- **Imports:** one icon per import path, for example `import { HouseSimpleIcon } from '@phosphor-icons/react/dist/csr/HouseSimple'`. No barrel imports.
- **Weight:** set per use, as in the table below.
- **Colour:** always `currentColor` from theme tokens.

Phosphor matches the following. These are its own drawings: the door-less house, the "Ψ4" fork and knife, the speaker-shaped megaphone, the 2×3-dot calendar.

| Use (crop id) | Phosphor icon | Weight | Size (CSS px) | Ink % |
|---|---|---|---|---|
| welcome-wallet | Wallet | regular | 29.57 | 24.1 |
| welcome-chat | ChatCircleDots | regular | 28.14 | 20.2 |
| signin-back | CaretLeft | bold | 17.09 | 11.4 |
| signin-eye | Eye | regular | 19.07 | 21.1 |
| home-chip-calendar | CalendarDots | bold | 17.42 | 40.9* |
| home-chip-wrench | Wrench | regular | 18.01 | 13.6 |
| home-chip-utensils | ForkKnife | regular | 18.11 | 19.8 |
| home-app-calendar | CalendarDots | regular | 24.82 | 22.0 |
| home-app-wrench | Wrench | regular | 24.40 | 26.0 |
| home-app-megaphone | MegaphoneSimple | regular | 25.22 | 29.0 |
| home-app-utensils | ForkKnife | regular | 24.84 | 25.0 |
| tab-home-active | HouseSimple | fill | 21.89 | 5.7 |
| tab-home | HouseSimple | regular | 21.89 | 9.1 |
| tab-bell | BellSimple | regular | 22.01 | 15.8 |
| tab-bell-active | BellSimple | fill | 22.01 | 21.1 |
| tab-support | Headset | regular | 21.75 | 16.1 |
| tab-support-active | Headset | fill | 21.75 | 23.6 |
| notif-chevron, help-chevron, profile-chevron | CaretRight | bold | 14.77 | 2.4–2.9 |
| profile-qr-chevron | CaretRight | bold | 14.77 | 16.5 (low-contrast #5B62AA) |
| help-phone (white, filled) | Phone | fill | 24.42 | 28.9 |
| help-arrow | ArrowRight | bold | 16.00 | 33.3* |
| profile-mail | EnvelopeSimple | regular | 15.20 | 16.1 |
| qr-close | X | bold | 15.02 | 11.4 |
| settings-back | CaretLeft | bold | 18.01 | 1.2 |

\* Same drawing; the score comes from rasterising at a small size. These two are re-checked in their screens' visual tests.

**Camera badge glyph:** a vectorised cut-out (below). Phosphor Camera scored 32.1%.

### Vectorised cut-out icons (17 SVGs; APPROVED)

**Tool:** `potrace` 2.1.8, a pure-JS port of Potrace, **licence GPL-2.0**. Approved 2026-11-07, on these conditions:
- It lives in `tools/ui-analysis/` only.
- It must never appear in `client/package.json` or `server/package.json`, nothing in `/client` or `/server` may import it, and it never ships.
- The GPL covers the tool. The traced SVG paths are its output.
- Its dependency `jimp` brings npm audit advisories. That's acceptable because it's dev-only and never ships.

**Script:** `tools/ui-analysis/src/trace-icons.ts`. Run it with:
`node tools/ui-analysis/run-in-docker.mjs src/trace-icons.ts`

**Output:** `reference-ui/assets/icons/cutout/<name>.svg`. Every file has:
- a square `viewBox` (8 units per screenshot device pixel)
- `fill="currentColor"` with `fill-rule="evenodd"`
- `aria-hidden="true"`

The colour always comes from theme tokens.

**Steps, as approved:**
1. **Coverage.** Each screenshot pixel is projected onto the line from background colour to icon colour, giving 0–1. Pixels outside the icon's crop (camera: outside the badge disc) count as 0.
2. **Upscale 8×.** Bilinear.
3. **Threshold at 0.5.** If the traced ink mass differs from the screenshot by more than ±3% (traced thinner or thicker), the threshold is tuned for that icon only. It sweeps 0.30–0.70 and picks the lowest coverage error. The value is recorded in the table below.
4. **Trace, save, check.** Potrace settings: `turdSize 16`, `alphaMax 1`, `optCurve`, `optTolerance 0.2`. Each SVG is then re-rendered at its box size in the Linux image and diffed against the screenshot.

**Box:** a square centred on the icon's ink box, with 3 device px padding, rounded up to a whole CSS px. Exception: the camera keeps the approved 14 CSS px box centred on the badge, so the badge CSS doesn't change.

**Metrics:**

| Metric | What it measures |
|---|---|
| Coverage error | Σ\|ref − traced\| / Σ max(ref, traced) over aligned coverage maps. **The primary score**: it doesn't depend on contrast |
| pixelmatch ink % | Standard metric, AA detection on. It's blind to white-on-pastel edges, hence 0% on the two Welcome icons |
| Mass | Traced ink mass divided by screenshot ink mass. 1.000 means the same stroke weight |

| SVG | Crop id | Box (CSS px) | Threshold | Coverage error | pixelmatch ink % | Mass |
|---|---|---|---|---|---|---|
| bed-welcome | welcome-bed | 25 | 0.5 | 8.5% | 0* | 0.994 |
| utensils-crossed | welcome-utensils | 27 | 0.5 | 15.7% | 0* | 0.978 |
| question-circle | help-question | 18 | **0.475** (thin at 0.5: mass 0.969) | 7.6% | 3.0 | 0.987 |
| video | help-video | 18 | 0.5 | 3.8% | 0.7 | 0.992 |
| bed-room | profile-bed | 14 | 0.5 | 10.1% | 7.3 | 0.988 |
| phone | profile-phone | 15 | 0.5 | 6.5% | 3.1 | 0.980 |
| qr-code | profile-qr | 20 | **0.44** (user: lower toward mass 1.0; thin at 0.5: mass 0.926) | 6.3% | 12.7 | 0.970† |
| user | profile-user | 20 | **0.475** (thin at 0.5: mass 0.963) | 6.4% | 3.6 | 0.994 |
| key | profile-key | 20 | 0.5 | 7.7% | 7.5 | 0.974 |
| shield-check | profile-shield | 20 | 0.5 | 7.4% | 5.6 | 0.976 |
| settings | profile-settings | 20 | 0.5 | 8.3% | 8.4 | 0.976 |
| info-circle | profile-info | 18 | 0.5 | 7.4% | 3.1 | 0.972 |
| logout | profile-logout | 19 | **0.475** (thin at 0.5: mass 0.961) | 5.2% | 5.5 | 0.983 |
| accessibility | settings-accessibility | 22 | 0.5 | 6.2% | 13.9 | 0.985 |
| gauge | settings-gauge | 21 | **0.45** (thin at 0.5: mass 0.968) | 6.2% | 10.3 | 1.009 |
| trash | settings-trash | 20 | 0.5 | 10.4% | 9.4 | 0.988 |
| camera | profile-camera | 14 (badge box) | 0.5 | 2.9% | 4.7 | 0.971 |

\* pixelmatch can't see edge differences between white and these pastel backgrounds. Use the coverage error.

† QR swept 0.47 → 0.43 (mass 0.949 / 0.953 / 0.959 / **0.970** / 0.978; coverage error 6.1 / 6.1 / 6.5 / **6.3** / 7.4%). 0.44 is closest to 1.0 without the shape degrading. Below that, the corners of the small squares fill in. The gauge was also tested at 0.44 and 0.43: it got thicker (mass 1.015 / 1.027) and worse (6.5 / 7.0%), so it stays at 0.45. All approved thresholds are pinned in `FIXED_T` in `trace-icons.ts`, so a re-run reproduces the committed SVGs exactly.

Sheet: `out/linux/icon-cutouts.png` (screenshot / traced SVG / diff). **Approved 2026-11-07, with the QR re-trace.** The final check is the Docker visual regression on each screen.

**Camera glyph:** `camera.svg` replaces the earlier raster cut-out in the badge component, in the same 14 px box at the same centre. The raster PNG was deleted on 2026-11-07, once a search found nothing left referencing it.

### Why each cut-out was needed

None of the three libraries has the same drawing for these:

| Crop id (screenshot) | Phosphor | Lucide | Heroicons |
|---|---|---|---|
| welcome-bed (01) | Bed 62.6% | BedDouble 28.7% | – |
| welcome-utensils, crossed (01) | ForkKnife 64.3% | UtensilsCrossed 56.1% | – |
| help-question (06) | Question 39.9% | CircleQuestionMark 42.9% | QuestionMarkCircleIcon 37.2% |
| help-video (06) | VideoCamera 48.7% | Video 46.0% | VideoCameraIcon 58.0% |
| profile-bed, room chip (07) | Bed 67.7% | BedDouble 53.4% | – |
| profile-phone, outline (07) | Phone 51.8% | Phone 50.8% | PhoneIcon 57.1% |
| profile-qr (07) | QrCode 59.0% | QrCode 66.5% | QrCodeIcon 48.8% |
| profile-user (07) | User 64.4% | User 52.4% | UserIcon 60.3% |
| profile-key (07) | Key 59.8% | KeyRound 60.0% | KeyIcon 55.0% |
| profile-shield (07) | ShieldCheck 48.0% | ShieldCheck 56.8% | ShieldCheckIcon 41.0% |
| profile-settings (07) | Gear 58.9% | Settings 56.0% | Cog6ToothIcon 31.0% |
| profile-info (07) | Info 37.3% | Info 43.6% | InformationCircleIcon 37.2% |
| profile-logout (07(1)) | SignOut 59.4% | LogOut 64.2% | ArrowRightStartOnRectangleIcon 66.4% |
| settings-accessibility (light) | PersonArmsSpread 63.6% | PersonStanding 68.9% | – |
| settings-gauge (light) | Speedometer 63.2% | Gauge 67.6% | – |
| settings-trash (light) | Trash 54.4% | Trash2 60.6% | TrashIcon 48.6% |

**Why welcome-bed isn't on Lucide.** Lucide's BedDouble scored 28.7%, but using it would mix two sets, which isn't allowed. It becomes a cut-out instead.

### Tabler Icons 3.50.0 (rejected; never use)

Tabler matches only the shapes Lucide also matches:

| Icon | Tabler ink % |
|---|---|
| ChevronLeft | 0.9 / 7.0 |
| ChevronRight | 1.4–2.4 |
| X | 3.8 |

Everything else is as bad as Lucide or worse:

| Icon | Tabler ink % | Note |
|---|---|---|
| Megaphone | 69.5 | |
| Wrench | 78.3 | |
| Accessibility figure | 69–78 | |
| User | 64.4 | 38 px wide vs 50 in the screenshot |
| Bed | 54–70 | Much flatter |
| QR | 65.0 | |
| Gauge | 58.1 | |
| Trash | 60.9 | |
| Settings gear | 62.7 | |
| Home outline | 47.8 | |
| Bell outline | 54.8 | |

The filled variants are also worse than Lucide's: HomeFilled 24.8 vs 9.0, CameraFilled 27.9 vs 21.7. **The screenshot icons come from a third set.**

### Lucide

Sizes are the Lucide `size` prop in CSS px; stroke is in Lucide viewBox units.

### Match Lucide (shape identical)

| Use | Lucide icon | Size | Stroke | Ink % |
|---|---|---|---|---|
| Back (Settings header) | ChevronLeft | 22.3 | 2 | 0.9 |
| Back (Sign in, inside a circle) | ChevronLeft | 21.2 | 2 | 7.0 |
| Row chevron | ChevronRight | 18.3 | 2 | 1.4–2.4 |
| Entry Pass close | X | 15.8 | 2.5 | 3.8 |
| Home tab, active (filled) | House, fill | 19.4 | 2 | 9.0 |
| Contact us phone (filled) | Phone, fill | 20.7 | 2 | 22.7 |
| Contact us arrow | ArrowRight | 18.2 | 2.25 | 28.5 |
| Camera badge (filled) | Camera, fill | 12.4 | 2 | 21.7 |
| Support tab, outline | Headset | 21.5 | 1.5 | 25.1 |
| Welcome chat | MessageCircleMore | 25.1 | 2 | 26.6 |
| Welcome bed | BedDouble | 25.1 | 1.75 | 28.7 |

### Don't match Lucide (visibly different shape or proportions)

| Use | Closest Lucide | Ink % | What's different |
|---|---|---|---|
| Announcements | Megaphone | 73.2 | Screenshot ink box is 62×52; Lucide is 59×62. Different drawing |
| Accessibility | PersonStanding / Accessibility | 69 / 79 | Different figure |
| Check connection | Gauge | 67.6 | Screenshot is 56×50; Lucide is 56×44 |
| Show QR | QrCode | 66.5 | Different module pattern |
| Sign Out | LogOut | 64.2 | Screenshot is 50×42; Lucide is 50×50 |
| Change Password | KeyRound | 60.0 | Different key shape |
| Clear stored data | Trash2 | 60.6 | Screenshot has vertical lines and a different lid |
| Support tab, active (filled) | Headset, fill | 55.0 | Different filled form |
| Privacy & Consent | ShieldCheck | 56.8 | Screenshot is 54×52; Lucide is 45×55 |
| Settings | Settings | 56.0 | Different gear teeth |
| Notifications tab, outline | Bell | 54.0 | Different bell outline |
| Profile room chip bed | BedDouble | 53.4 | Different bed |
| Chip calendar / app calendar | CalendarDays | 53.6 / 37.3 | Different dot grid and rings |
| Chip wrench / app wrench | Wrench | 57.3 / 49.1 | Different wrench |
| Chip utensils / app utensils | Utensils | 45.2 / 42.2 | Different fork and knife |
| My Information | User | 52.4 | Screenshot is 50×54; Lucide is 43×54 |
| Profile phone (outline) | Phone | 50.8 | |
| Welcome wallet | Wallet | 49.7 | |
| Video tutorials | Video | 46.0 | |
| About | Info | 43.6 | |
| Common questions | CircleQuestionMark | 42.9 | |
| Password eye | Eye | 40.8 | |
| Profile mail | Mail | 39.6 | |
| Home tab, outline | House | 33.8 | Screenshot house has no door |
| Notifications tab, active (filled) | Bell, fill | 29.0 | |
| Welcome utensils | UtensilsCrossed | 56.1 | |

## 5. Default avatar (FINAL: v2 approved 2026-11-07)

**File:** `reference-ui/assets/avatar-default.png`, 198 × 198 RGBA.

- It sits on the screenshot's pixel grid: pixel (0,0) is screenshot pixel (107,334).
- Every visible pixel outside the rebuilt patch is a byte copy (98.4%; the rest are the anti-aliased circle edge).
- The circle's centre is at (99.46, 99.41) in the file, 0.15 CSS px off-centre, which isn't visible.
- **Display at exactly 66 CSS px, on whole CSS pixels.** Fractional positions make Chrome resample the image.
- **Don't add `border-radius`.** The file already has a smooth circular alpha.

**Rebuilt region (v2).** The region under the badge and its ring is rebuilt; it is 7.7% of the disc.

1. The Home tab-bar avatar (no badge) is registered to the profile avatar using the visible area around the badge. Result: offset 0,0; scale 1.02.
2. The hidden area is rebuilt with 4×4 supersampling, snapped to the colours found right next to the badge: #265D71 (shadow teal), #484849 (jacket) and #FDFDFD.
3. The blend band starts 42 device px from the badge centre, outside the ring. v1 blended into the ring, which caused the faint arc.

Review sheets: `avatar-before-after.png` (100%) and `avatar-before-after-zoom.png` (4×).

## 6. CameraBadge component (FINAL: approved 2026-11-07, including the cut-out glyph; built in the frontend phase)

The badge is a **separate element** over the avatar, at its bottom-right.

| Element | Measured (device px → CSS px) | Component value |
|---|---|---|
| Avatar | Diameter 198.36 → 66.12 | **66 × 66** |
| Blue disc | Diameter 66.2 → 22.07, colour **#4A5CE6** | **22 × 22**, `--badge-bg: #4A5CE6` |
| Ring | 5.95 → 1.98, card colour | **2 px border, `var(--surface-card)`**: #181B24 dark, #FFFFFF light |
| Badge outer box | 78.1 → 26.03 | 26 × 26 |
| Badge centre − avatar centre | (+72.0, +72.1) → (+24.01, +24.04) | `right: -4px; bottom: -4px` (centre at +24, +24) |
| Camera glyph | Ink 35 × 27 → 11.67 × 9.0. Offset from the badge centre (+0.34, −0.01) | `reference-ui/assets/icons/cutout/camera.svg` in a 14 × 14 box, `color: #fff`. The offset is built into the SVG |

**About the glyph.** It is the real icon from the screenshot, not Lucide or Tabler: white on blue, unblended to white plus transparency, in a 14 CSS px box. It is cropped centred on the badge, so the measured offset is built into the image.

**Diff vs screenshot** (dark card, Linux image):

| Region | Mismatch |
|---|---|
| Avatar + badge (228 × 228 device px) | **1.76%** (with `camera.svg`; 1.80% with the earlier raster glyph) |
| Badge only (84 × 84) | 8.16% (8.42% raster) |

What's left is the rim and glyph edges, because the component's clean values put the badge 0.16 CSS px from the measured centre. The disc colour, ring, glyph shape and the whole avatar interior match.

**The light-card ring colour is PROVISIONAL** until a light Profile screenshot arrives. Today the light variant swaps only `--surface-card` (#FFFFFF), and the badge blue is assumed to be the same.

Sheet: `camera-badge.png`.

## 7. Other avatar sizes

| Element | Measurement (CSS px) |
|---|---|
| Profile avatar | Centre (68.82, 144.47) from the top of the screenshot |
| Tab-bar avatar, inactive | Artwork diameter 21.7, with a 1 px #3F424B border (about 24 total) |
| Tab-bar avatar, active | Measured on `07-profile.png` (§13): a 1.167 px #4A5CE6 ring filling the margin around the 21.667 px artwork, a 1.5 px gap in the tab-bar colour, and a 1.5 px #4A5CE6 outer ring: 30 px across |

## 8. Reproducing these numbers

Every committed script runs in Playwright's Linux image. Run them from the repository root:

```
node tools/ui-analysis/run-in-docker.mjs src/<script>.ts
```

Each one reads the gitignored reference screenshots, which are mounted into the container, never copied. Review sheets and JSON go to `tools/ui-analysis/out/linux/`.

| Script | Reproduces | Writes committed files? |
|---|---|---|
| `fontfit.ts` | §2 type scale: font comparison, size, weight, tracking. `FONT_ONLY="Plus Jakarta Sans"` limits it to the chosen font | No |
| `wordmark.ts` | §3 logo-pill geometry, wordmark fit, pill / logo-mark / wordmark mismatch | No |
| `logo-colours.ts` | §3 screenshot vs supplied-file logo colours | No |
| `logo-transparent.ts` | §3 `logo-spacebasic-transparent.png` | **Yes**. Byte-identical on re-run |
| `icons.ts` | §4 Lucide and Tabler tables (`LIB=lucide` or `LIB=tabler`) | No |
| `icons-multi.ts` | §4 Lucide / Phosphor / Heroicons comparison and the Phosphor decision | No |
| `trace-icons.ts` | §4 the 17 cut-out SVGs, with thresholds pinned in `FIXED_T` | **Yes**. Byte-identical on re-run |
| `avatar-measure.ts` | §5 / §7 Profile avatar circle and Home tab-bar avatar geometry | No |
| `avatar-v2.ts` | §5 `avatar-default.png` | **Yes**. Byte-identical on re-run |
| `badge.ts` | §6 CameraBadge geometry, plus the prototype diff with `camera.svg` | No |
| `probe.ts` | §9 box edges (sub-pixel), ink bands and stroke colours of a screenshot (no browser) | No |
| `visual.ts` | Per-screen visual regression (§9, §10). `npm run test:visual` | No (writes gitignored `client/tests/visual/__output__/`) |
| `smoke-signin.ts` | Functional check: signs in through the UI against a running `npm run dev`, including Notifications (list, mark-as-read), Help (contacts, FAQs), My Profile (data, photo upload and removal, Sign Out) and the Entry Pass (the canvas matches the issued token module by module, a warden scan of it, rotation, close and Escape) (not a visual test) | No |
| `smoke-roles.ts` | Functional check of role routing: each role's own app, blocked cross-role URLs, no tab bar for staff, the admin sidebar / phone strip, the two-role chooser, remembered choice and switching both ways; saves review screenshots to `out/roles-*.png` | No |
| `smoke-otp.ts` | Functional check: SMS, WhatsApp and email one-time codes and Forgot password through the UI. Starts `npm run dev` itself and reads the codes from the server console (dev ports must be free; at most 5 codes an hour per address) | No |

Shared modules:
- `lib.ts`: PNG, ink, diff and browser helpers
- `icon-specs.ts`: icon crop boxes
- `dev-stack.ts`: starts the dev stack for a smoke script with relaxed sign-in limits (`RELAX_RATE_LIMITS=true`, development only), or reuses a running one
- `run-in-docker.mjs`: the Docker runner. It pins the image to the installed Playwright version and sets `--font-render-hinting=none`.

One-off debug probes live in `tools/ui-analysis/scratch/`, which is gitignored and not part of the reproducible set: `avatar-probe.ts`, `avatar-zoom.ts`, `avatar.ts` (the superseded v1 avatar generator), `badge-debug.ts`, `bands.ts`, `measure-pill.ts`, `measure-pill2.ts`, `border-snap.ts`, `text-snap.ts`, `dsf-test.ts`, `layout-dump.ts`, and for the Entry Pass (§14) `qr-grid.ts`, `qr-edges.ts`, `qr-scrim.ts`, `qr-ring.ts`, `qr-cols.ts`, `qr-dim.ts`, `qr-zoom.ts`, `qr-zoom2.ts`, `notif-read.ts`.

`fontfit.ts` reads the Settings device ID from the gitignored `tools/ui-analysis/private/screenshot-text.json` (`{ "deviceId": "..." }`); without it, those samples are skipped.

## 9. Auth screens: Welcome and Sign in (step 6, first checkpoint)

Measured with `probe.ts` (sub-pixel box edges, ink bands and stroke colours) and `fontfit.ts`, then corrected from the per-element report of `visual.ts`. Positions are CSS px from the top of the **app band**: the screenshot below the Android status bar (device rows 0–77) and above the navigation bar (rows 2296+). The band is 2218 device px = **739.333 CSS px** tall.

**Common**
- Every full-width box spans device px 57 → 1024: left gutter 19 px, right 18.667 px.
- Borders are 2 device px (#E8E7EC segmented track and consent card, #DBDCE0 inputs) and 4 device px (#E2E2E2 outline button, #C2C2C2 checkbox), drawn as inset rings (`box-shadow: inset 0 0 0 0.6667px`), which are exact on every renderer (decisions.md).
- Fills: #F7F8FC (inputs, segmented track, consent card, back button). Disabled button #F0F0F0 with #666666 text.

**Welcome (01)**

| Element | Measurement |
|---|---|
| Hero panel | #384BD5, height 310.667 (932 device px), bottom corners radius 28 (fitted at 5 columns) |
| Circle | #4658D8, centre (295.15, 43.78), r 122.16 |
| Pill | left 19, top 55.667, 193 × 50.667, white. Logo with its own proportions (`object-fit: contain`) centred in the measured ink box 32.333 × 28.333 at (37.667, 66.667), so it renders 30.45 × 28.333; wordmark as §3 |
| Badges | 58.333 (175 device px). Left 19 / 88.667 / 158.333 / 228, top 222 / 237 / 222 / 237. Mint #A9E2CF, yellow #FED981, sky #AAD3E9, pink #FFB4C0. White icons centred: bed and utensils cut-outs (25, 27 px), Phosphor Wallet (29.57; its drawing sits 0.667 px right and high, corrected) and ChatCircleDots (28.14) |
| Headline | ink top 366.67, 30/500/−0.03em, line 35 |
| Subtitle | ink top 447.0, 17/400, line 25.5; it wraps after "and", so the column is about 210 px wide |
| Primary button | top 533.0, 49 tall, glow `0 6px 14px rgb(56 75 213 / 0.3)` (approximate: see §9 residuals) |
| Outline button | top 593.333 (gap 11.333), 4 device px #E2E2E2 ring, label #384BD5 |
| Footer | "Privacy Policy · Terms & Conditions", ink top 686.0; the gaps around "·" are 2 px wider than a space |

**Sign in (02 Mobile, 03 Email)**

| Element | Measurement |
|---|---|
| Back button | circle 41.333 at (11.333, 33.0), #F7F8FC; CaretLeft bold 17.09 centred (Phosphor's caret needs +1 px x) |
| Title / subtitle | ink tops 88.33 / 126.33 |
| Segmented track | top 165.0 (Mobile) / 186.0 (Email), 46.5 tall, radius 14. Selected pill white, 4.333 inside, 4 px gap between segments, shadow `0 2px 4px rgb(19 22 31 / 0.08)` |
| Field | label 18 px row, then the box 4.1 below; box 42.833 tall (128.5 device px), radius 14, text inset 15.333 |
| Password row | 13.333 px taller than a plain label row (the "Forgot password?" tap area); the link sits 2 px in from the right gutter |
| Consent card | top 373.333 (Mobile), 115.667 tall with five lines; checkbox 18.667, radius 5.333, at (34.667, 387.0); text from x 65.67 |
| Submit | 49 tall, pushed to the bottom (Mobile top 621.667); helper ink top 685.67 |

**Visual results (Linux image, real DPR 3, 2026-11-08).** Welcome **0.93%** (pass), Sign in Mobile **1.28%**, Sign in Email **1.59%** (within the 3% ceiling). Every measured element is within 2 device px of the reference.

| Region | Mismatch |
|---|---|
| Logo pill, 591 × 164 device px (stretched logo, emulated DPR) | 6.47% |
| Logo pill, logo with `object-fit: contain` (emulated DPR) | 6.59% |
| **Logo pill, `contain`, real DPR (final)** | **4.46%** (logo mark alone 14.97%) |

What remains:
1. **Glyph edges.** Android and Linux rasterise the same font differently; on the links and labels this is most of the region's mismatch (for example 12.5% on "Send it on WhatsApp instead", with position and size matching).
2. **Circle and pill edges** (anti-aliasing), and the logo mark: the supplied file differs from the app's mark (§3, accepted).
3. **The primary button's glow** is an approximation: the reference's is about 10 px left, 15 px right, 6 px above.

## 10. Home (dark)

Measured with `probe.ts` and `fontfit.ts` (`h-*` samples), then corrected from `visual.ts`. Positions are CSS px from the top of the screen: in-app screens are edge-to-edge, so this includes the 26 px status bar (`--safe-top` on a phone that draws the app under it).

| Element | Measurement |
|---|---|
| Header | 0 → 149.667, linear gradient #3D4FD7 → #2F3EBF |
| Logo tile | 28 × 28 at (16, 40), white, radius 10. Logo fitted in the measured ink box 21.333 × 18 at (19.333, 43.667) |
| Institution name | ink from (52.67, 50.0), 10.26 / 700 / +0.135em, upper case, #B1BAF9 |
| Greeting | ink top 89.33, 23.6 / 400, white |
| Date | ink top 120.0, 13 / 400, #B7BDF8 |
| Page | #101116 below the header; gutter 16 |
| Section labels | "QUICK ACTIONS" ink top 188.33, "APPS" 277.67; 10.59 / 600 / +0.11em, #8A909F, 2 px in from the gutter |
| Chips | 44 tall at y 209, radius 22, #181B24 with a 1 px #2A2D36 ring and a 2 px dark shadow, 8 px apart; content 12.333 px from the left edge, 17.333 from the right; text 14 / 500 #EDEEF3; icons #8B96FF (§4). The screenshot's row is scrolled 27.333 px |
| Apps card | x 16 → 344, y 296 → 429.333, radius 22, 1 px #2A2D36 ring, #181B24 |
| App tiles | 52 × 52, radius 16, #1E2140, first at x 37.667, top 317, 77.667 apart; icons #8B96FF (§4) |
| App labels | 11.9 / 400 #EDEEF3, line 15.667, column 64 wide; "Announcements" 9.6 px, breaking inside the word |
| Tab bar | from y 709: 0.667 px #2A2D34 top border, #181B24; four 86 px columns inside 8 px padding |
| Active tab | 28 × 3 indicator #4A5CE6 under the border; icon and label #8B96FF, label 600 |
| Tab labels | 11.1 / 400 #A4A9B7, ink top 757 |
| Badge | #FF6A7D pill about 24.667 × 13, top-left (139, 726.33); "99+" dark #1A121D |
| Profile tab avatar | 24 circle with a 0.667 px #3F424B ring, default avatar at 21.667 |

**In-app colours.** Dark (measured): page #101116, card #181B24, border #2A2D36, text #EDEEF3 / #A3A9B7, header divider #232429. Light (from `settings-light.png`): page #F5F6FA, card #FFFFFF, border #EEEFF4, text #13161F / #6D717D; the rest is provisional (`tokens.css`).

**Visual result (Linux image, real DPR 3, 2026-11-08).** Home **1.34%** with the private fixture (exact screenshot data), **1.25%** with the fake fixture and the name masked. Every region's box is within 1 device px. Highest regions: the logo tile (15.5%: the supplied Presidency file differs from the app's mark) and text edges (10–11% on the greeting, date and institution name).

## 11. Notifications (dark)

Measured with `probe.ts` and `fontfit.ts` (`n-*` samples), then corrected from `visual.ts`. Positions are CSS px from the top of the screen (status bar included), as in §10.

| Element | Measurement |
|---|---|
| Header | 0 → 83.667 on the page colour #101116, then a 1 px #2A2D36 line and a 3 px #181B24 band; the list starts at 87.667 |
| Title "Notifications" | 22 / 500, #EDEEF3, ink from (17.67, 50.33), no back button |
| Day heading | Band 41.2 tall on #101116; "25 OCT 2026" 9.85 / 700 / +0.16em, upper case, #8A909F, ink from x 16.33, cap top 22.67 below the band top. Two-digit day ("09 OCT 2026") |
| Rows | 63.6 tall, full width, #181B24. Every row after the first in a day has a 1 px #2A2D36 line inside its top edge (it doesn't move the content). Band boundaries fitted from the device-px edges (rows 190.86, headings 123.57 device px) |
| Row title | 14 px; unread 500 #EDEEF3, read 400 #A3A9B7; ink from x 36, cap top 16.33 below the row top. "👋" is part of the title text and uses the system emoji font (3.7% region mismatch in the Docker image) |
| Time | "07:24 PM", 12 / 400, **tabular-nums** (16.8% ink mismatch vs 37.8% proportional), #8A909F, cap top 38.33 below the row top |
| Unread dot | 8 × 8 circle #4A5CE6 at x 16, centred on the title's capitals. Read rows have none |
| Chevron | CaretRight bold 14.77 (§4), #494F5D (new token `--chevron`), ink 6 × 10.67 ending at x 339, centred on the title line |
| Active Notifications tab | First reference for it: filled bell #8B96FF, label #8B96FF 600, 28 × 3 indicator #4A5CE6 (as §10) |
| Badge | Pill 25.333 × 13 at (138.33, 726.33), with a 1.333 px ring in the tab-bar colour cut into the bell. This corrected the badge on Home too (it was 0.667 px high and 0.667 px wide) |

**Visual result (Linux image, real DPR 3, 2026-11-08).** Notifications **0.90%** (fake fixture; the screen shows no personal data). Every region's box is within 1 device px. Highest regions: the "99+" badge text (13.8%), the emoji (3.7%) and text edges. Home went from 1.34% to 1.32% with the badge fix.

## 12. Help, the Support tab (dark)

Measured with `probe.ts` and `fontfit.ts` (`p-*` samples), then corrected from `visual.ts`. CSS px from the top of the screen (status bar included).

| Element | Measurement |
|---|---|
| Header | 0 → 83.667 on #101116, a 1 px #232429 divider (`--divider`) under it, no band (unlike Notifications) |
| Title "Help" | 22 / 500, #EDEEF3, cap top 50.33 (as Notifications) |
| Subtitle | 14 / 400, #A3A9B7, line 21, cap top 89 (the first line box starts 1.33 px above the divider's bottom edge) |
| "Contact us" card | 16 → 344, y 141.667 → 234.333 (92.667 tall), radius 20. Fill `linear-gradient(140deg, #4457E1 0%, #4A5CE6 55.5%, #3E50DA 100%)`, fitted on a 16 × 5 grid of samples (two checks between fit points within one hex step). Glow `0 8px 32px rgb(74 92 230 / 0.32)`, fitted from the falloff beside and below the card |
| Phone tile | 42 × 42 at (32, 167), radius 14 (corner fit 13.7), white at 16% over the gradient; Phosphor Phone fill 24.42 (§4), white |
| Contact text | "Contact us" 18 / 500 white, cap top 162, ink from x 87; "Reach your hostel office or / SpaceBasic." 13 / 400 #DCE2FF, line 18.333 |
| Arrow | Phosphor ArrowRight bold 16 (§4), white, ink ending at x 325.33, centred on the card. In the visual test its head is about 1 px taller than the screenshot's (3.8% of the region); §4 had flagged this icon for exactly this check |
| "Common questions" card | 16 → 344, y 250.333 → 329.333 (79 tall), radius 20 (corner fit 19.7), #181B24 with a 1 px #2A2D36 ring |
| Question tile | 38 × 38 at (33, 271), radius 12 (corner fit 11.7), #1E2140 (`--tile-bg`); `question-circle.svg` cut-out in 18 px, #8B96FF |
| FAQ text | "Common questions" 14 / 400 #EDEEF3, cap top 267.67, ink from x 83.67; "Leave, tickets, announcements and / signing in" 12 / 400 #A3A9B7, line 16.667 |
| Chevron | CaretRight bold 14.77, #494F5D, ink 6 × 10.67 ending at x 322, centred on the card |
| Video line | `video.svg` cut-out in 18 px and "Video tutorials are on the way." 13 / 400, #8A909F, centred as one line, cap top 354, ink from x 78.33 |
| Active Support tab | Headset fill, #8B96FF; indicator and label as §10 |

**Visual result (Linux image, real DPR 3, 2026-11-08).** Help **0.98%** (fake fixture; the screen shows no personal data). Every region's box is within 1 device px except the arrow's height (above). Highest regions: the video line (8.4%, text edges) and the contact text (6.4%).

## 13. My Profile (dark)

Two screenshots: `07-profile.png` (top) and `07-profile(1).png` (the same screen scrolled to the end, 122.67 px). Measured with `probe.ts` and `fontfit.ts` (`r-*` samples; the name, phone and email samples read their text from the gitignored `private/screenshot-text.json`), then corrected from `visual.ts`. CSS px from the top of the screen (status bar included).

| Element | Measurement |
|---|---|
| Header | As Help (§12): 0 → 83.667, 1 px #232429 divider; "My Profile" 22 / 500 |
| Sticky top | Header + profile card stay put: in the scrolled screenshot the list is clipped at y 323 (the card's bottom 319 + 4 px of page) |
| Profile card | 16 → 344, y 91.667 → 319 (227.333 tall), radius 20 (corner fit 19.8), #181B24 with a 1 px #2A2D36 ring |
| Avatar + badge | The approved 66 px avatar (§5) at (35.667, 111.333), its registration on the screenshot's device grid (device pixel 107, 334); the approved CameraBadge (§6). Region 1.7% |
| Name | 20 / 500, upper case, no tracking, #EDEEF3, cap top 115.667, ink from x 122 |
| Room chip | Pill 107.333 × 22.667 at (120.667, 141.667), #1E2140; `bed-room.svg` in 14 px; "West CS240" 11.75 / 500 #8B96FF (weak font fit, 54% ink; the region diff is 8.4%, text edges) |
| Phone, email | `phone.svg` 15 px and Phosphor EnvelopeSimple 15.2, #8A909F; text 13 / 400 #A3A9B7 (proportional digits: 22.6% vs 57% tabular), from x 141.67; lines centred at y 186.17 and 207.83. An Indian number shows as its 10 digits ("9876543210") |
| QR panel | 292.667 × 69.667 at (33.667, 232.333), radius 20, #1E2140. Tile 38 × 38 at (44.667, 247.833), radius 13.333, #4A5CE6, `qr-code.svg` 20 px white. "Show my QR code" 14 / 500 #EDEEF3, cap top 245.67; "Attendance, amenities and / check-in" 12 / 400 #C3C6D5, line 16.333. Chevron CaretRight bold 14.77 #5B62AA |
| Section labels | "ACCOUNT" cap top 330.33, "APP" 559.33; 9.85 / 700 / +0.175em, #8A909F, x 18 |
| List cards | Radius 20, 1 px border, rows 62 tall (first row's top at the card's top + 1); every row after the first has a 1 px #2A2D36 line at its top. ACCOUNT 348.667 → 536.667, APP from 578 (2 rows), Sign Out 24 below APP (1 row) |
| Rows | Tile 38 × 38 at x 33, radius 12, #1E2140, cut-outs (`user`, `key`, `shield-check`, `settings` 20 px; `info-circle` 18; `logout` 19) in #8B96FF; label 14 / 400 #EDEEF3 from x 83; chevron #494F5D, ink ending at x 322 |
| Sign Out | Tile #38191F, `logout.svg` and "Sign Out" (14 / 500) in #F893A5 |
| Page end | "Sign Out" ends 39.667 above the tab bar; the page then scrolls exactly 122.667, as in the screenshot |
| Active My Profile tab | See §7 |

**Visual result (Linux image, real DPR 3, 2026-11-08), private fixture (exact screenshot data).** My Profile **1.14%**, scrolled **1.11%**. Every region's box is within 1 device px; the name 0.23%, row icons 0.27%. What remains is text edges (chip 8.4%, labels) and the avatar's anti-aliased rim. With the committed fake fixture the name, phone and email are masked.

## 14. Entry Pass (dark)

`QR_entry-pass.png`: the sheet over My Profile (scrolled to the top). Measured with `probe.ts`, `fontfit.ts` (`q-*` samples; `q-name` reads the name from the gitignored `private/screenshot-text.json`) and the scratch probes `qr-grid.ts`, `qr-edges.ts`, `qr-scrim.ts`, `qr-ring.ts` and `qr-cols.ts`, then corrected from `visual.ts`. CSS px from the top of the screen (status bar included).

| Element | Measurement |
|---|---|
| Scrim | Black at 40 % over My Profile: fitted per channel on 10 flat areas against `07-profile.png` (alpha 0.393 / 0.401 / 0.402, offset ≈ 0) (`--scrim`) |
| Sheet | Top 311.97 → bottom of the screen (473.333 above the 14.667 px gesture bar), full width, top corners radius 20 (fit 19.95), #181B24 (`--surface-card`) |
| "ENTRY PASS" | 9.85 / 700 / +0.155em, upper case, #8A909F, cap top 336.33, ink from x 20.67 |
| Name | 20 / 500, upper case, #EDEEF3, cap top 355.67, ink from x 21 (as the profile name) |
| Room | "West CS240" 13.75 / 500, #8B96FF (`--accent`), cap top 383, ink from x 20 |
| Close | 36 × 36 disc at (310, 330), #20242F (`--sheet-close-bg`); Phosphor X bold 15.02 (§4), #A3A9B7, ink 10 × 10 centred |
| QR card | 223.333 × 223 at (68.333, 418.667), white, radius 26 (corner fit 25.96), 12 px padding |
| QR | **Version 6, error-correction level M, mask 2** (format bits read from the screenshot), 41 × 41 modules, dark modules #141414 on white. The module edges are not evenly spaced: most modules are 14.02 device px wide and every 11th (modules 9, 20, 31) is 12.80. That is `qrcode`'s canvas renderer: fitted on every edge of both timing patterns, **canvas 512 px, margin 1 module**, shown at **199.333 × 199** from (80.347, 430.641) (rms 0.019 / 0.007 device px; the next-best fits are far off). The browser smooths it when scaling, which gives the anti-aliased edges |
| Token length | Version 6-M holds 85–106 bytes, so the original's payload is that long. Ours is always 96 characters (byte mode) → always version 6-M (`docs/decisions.md` "Compact QR token") |
| Countdown | Ring 22.667 px box at (124.667, 670.333), circle r 10, stroke 2.667: track #20222E (`--ring-track`), arc #8B96FF with round caps, clockwise from 12 o'clock. Half-coverage ends at 320° and 353° at mid-radius; minus the caps (7.7° each) the arc runs 0° → 312.3°, i.e. **8.68 s of a 10 s cycle while the label says "9s"**: the ring drains continuously and the label rounds up |
| "Expires in 9s" | "Expires in" 14 / 400 #A3A9B7, "9s" 13.75 / 500 #EDEEF3, cap top 676.67; ring and text centred together (ink 124.67 → 235.33, centre 180), ring-to-text gap 8.667 |
| Footer | "Scanned for attendance, amenities and check-in." 13 / 400 #8A909F, centred, cap top 718 |

**Font-fit crops.** The first `q-expires` and `q-seconds` crops were wrong: one cut the "n" off "in", the other started inside the "n". With clean crops (column ink runs: "in" ends at device x 651, "9s" spans 663 → 706) the fit is "Expires in" 14.01 / 400 (17.9 %) and "9s" 13.75 / 500 (6.8 %).

**Visual result (Linux image, real DPR 3, 2026-11-08), private fixture.** Entry Pass **0.70%**. The QR's data modules depend on the token (new every 10 s), so they're masked in three rectangles; the three finder corners (with the format bits: the fixture token is a FAKE one chosen to use mask 2, like the screenshot), the card and its padding are compared: QR card 0.09 %, top-left corner 0.24 %, bottom-right corner 0.44 %, all boxes exact. The clock is set 1.32 s after the code arrives, so the ring ends at 312.5° (ring region 1.31 %). Every region's box is within 1 device px; what remains is text edges (room 13.6 %, "ENTRY PASS" 7.8 %).
