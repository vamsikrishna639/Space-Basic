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

**Camera glyph:** `camera.svg` replaces the raster `icon-camera-badge.png` in the badge component, in the same 14 px box at the same centre. The PNG is kept for reference only.

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
| Camera glyph | Ink 35 × 27 → 11.67 × 9.0. Offset from the badge centre (+0.34, −0.01) | `reference-ui/assets/icon-camera-badge.png`, 42 × 42 white + alpha |

**About the glyph.** It is the real icon from the screenshot, not Lucide or Tabler: white on blue, unblended to white plus transparency, in a 14 CSS px box. It is cropped centred on the badge, so the measured offset is built into the image.

**Diff vs screenshot** (dark card, Linux image):

| Region | Mismatch |
|---|---|
| Avatar + badge (228 × 228 device px) | **1.80%** |
| Badge only (84 × 84) | 8.42% |

What's left is the rim and glyph edges, because the component's clean values put the badge 0.16 CSS px from the measured centre. The disc colour, ring, glyph shape and the whole avatar interior match.

**The light-card ring colour is PROVISIONAL** until a light Profile screenshot arrives. Today the light variant swaps only `--surface-card` (#FFFFFF), and the badge blue is assumed to be the same.

Sheet: `camera-badge.png`.

## 7. Other avatar sizes

| Element | Measurement (CSS px) |
|---|---|
| Profile avatar | Centre (68.82, 144.47) from the top of the screenshot |
| Tab-bar avatar, inactive | Artwork diameter 21.7, with a 1 px #3F424B border (about 24 total) |
| Tab-bar avatar, active | Ring in the active tab colour. To be measured at the tab-bar step |
