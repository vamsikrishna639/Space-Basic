// Visual regression specs (SPEC.md, "Pixel-perfect UI constraint" 7). Run in Playwright's Linux image only:
//   npm run test:visual            (builds the client, then runs tools/ui-analysis/src/visual.ts in Docker)
//
// Coordinates are screenshot DEVICE px (DPR 3). `app` is the band of the screenshot that belongs to the app:
// below the Android status bar and above the navigation bar. Everything outside it is OS chrome and is cropped
// from both images before diffing. Region rects are relative to the top of that band and only feed the
// per-element report (ink-box offsets, for tuning); the pass/fail number is the whole-band mismatch.
// No imports: this file is loaded by the Docker runner with Node's type stripping.

export interface Region {
  name: string;
  rect: [x: number, y: number, w: number, h: number];
  /** Also write a full-resolution reference / render / diff crop of this region. */
  zoom?: boolean;
}

export interface ScreenSpec {
  id: string;
  /** File in reference-ui/ (gitignored: may contain personal data). */
  ref: string;
  route: string;
  /** App band in the screenshot, device px [top, bottom). */
  app: [top: number, bottom: number];
  regions: Region[];
  /** Device-px rects (band coordinates) excluded from the diff, e.g. personal data with no private fixture. */
  masks?: Region[];
}

const AUTH_APP: [number, number] = [78, 2296]; // 739.333 CSS px

export const SCREENS: ScreenSpec[] = [
  {
    id: 'welcome',
    ref: '01-welcome.png',
    route: '/',
    app: AUTH_APP,
    regions: [
      { name: 'logo pill', rect: [51, 161, 591, 164], zoom: true },
      { name: 'logo mark', rect: [100, 185, 120, 120] },
      { name: 'wordmark', rect: [225, 195, 400, 100] },
      { name: 'bed icon', rect: [92, 701, 105, 105] },
      { name: 'utensils icon', rect: [301, 746, 105, 105] },
      { name: 'wallet icon', rect: [510, 701, 105, 105] },
      { name: 'chat icon', rect: [719, 746, 105, 105] },
      { name: 'headline', rect: [30, 1080, 1000, 230] },
      { name: 'lead', rect: [30, 1320, 1000, 160] },
      { name: 'primary label', rect: [250, 1630, 580, 80] },
      { name: 'outline label', rect: [250, 1810, 580, 90] },
      { name: 'footer', rect: [100, 2040, 880, 70] },
    ],
  },
  {
    id: 'signin-mobile',
    ref: '02-signin-mobile.png',
    route: '/sign-in/mobile',
    app: AUTH_APP,
    regions: [
      { name: 'back caret', rect: [60, 120, 70, 100] },
      { name: 'title', rect: [50, 245, 300, 110] },
      { name: 'subtitle', rect: [45, 365, 960, 70] },
      { name: 'segment off (Email)', rect: [230, 530, 150, 60] },
      { name: 'segment on (Mobile)', rect: [690, 530, 180, 60] },
      { name: 'label', rect: [50, 690, 300, 50] },
      { name: 'placeholder', rect: [90, 785, 330, 60] },
      { name: 'link', rect: [50, 975, 560, 60] },
      { name: 'checkbox', rect: [95, 1145, 75, 75] },
      { name: 'consent text', rect: [185, 1160, 800, 270] },
      { name: 'privacy link', rect: [50, 1560, 450, 70] },
      { name: 'button label', rect: [400, 1895, 280, 80] },
      { name: 'helper', rect: [150, 2040, 780, 60] },
    ],
  },
  {
    id: 'signin-email',
    ref: '03-signin-email.png',
    route: '/sign-in/email',
    app: AUTH_APP,
    regions: [
      { name: 'back caret', rect: [60, 120, 70, 100] },
      { name: 'title', rect: [50, 245, 300, 110] },
      { name: 'subtitle', rect: [45, 365, 980, 130] },
      { name: 'segment on (Email)', rect: [230, 593, 160, 60] },
      { name: 'segment off (Mobile)', rect: [690, 593, 180, 60] },
      { name: 'email label', rect: [50, 753, 160, 50] },
      { name: 'email placeholder', rect: [90, 850, 470, 70] },
      { name: 'password label', rect: [50, 1040, 220, 55] },
      { name: 'forgot link', rect: [680, 1040, 360, 60] },
      { name: 'password placeholder', rect: [90, 1180, 480, 70] },
      { name: 'eye icon', rect: [880, 1170, 120, 80] },
      { name: 'otp link', rect: [50, 1365, 700, 60] },
      { name: 'checkbox', rect: [95, 1535, 75, 75] },
      { name: 'consent text', rect: [185, 1550, 800, 270] },
      { name: 'privacy link', rect: [50, 1950, 450, 70] },
      { name: 'button label', rect: [400, 2140, 280, 78] },
    ],
  },
];
