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
  /** Band of the screenshot that is compared, device px [top, bottom). */
  app: [top: number, bottom: number];
  /**
   * 'band' (auth screens): the app's viewport IS the band (the OS bars sit outside the app).
   * 'screen' (in-app screens): the app is edge-to-edge, so it renders at the full screen height (`screenHeight`
   * CSS px) and the same band is cropped from both images.
   */
  viewport?: 'band' | 'screen';
  screenHeight?: number;
  /** CSS custom properties set on :root (safe-area insets). */
  cssVars?: Record<string, string>;
  colorScheme?: 'light' | 'dark';
  /** Fixed clock (ISO with offset) and time zone, for greetings and dates. */
  time?: string;
  timezone?: string;
  /** API fixture: client/tests/fixtures/private/<name>.json if present (exact screenshot data), else
   * client/tests/fixtures/<name>.json (fake data of the same length, with `fakeMasks` applied). */
  fixture?: string;
  /** Mocked GET /attendance/qr-token: this token (FAKE, unsigned), 10 s cycle. */
  qrToken?: string;
  /** Fixed clock to set once the page has loaded (ISO), e.g. to put a countdown where the screenshot shows it. */
  clockAfterLoad?: string;
  /** 'end': scroll the page to the bottom before the screenshot (07-profile(1).png is My Profile scrolled down). */
  scrollY?: 'end';
  /** Horizontal scroll positions to restore, CSS px (e.g. the Quick Actions row in the screenshot). */
  scrollX?: { selector: string; left: number }[];
  regions: Region[];
  /** Device-px rects (band coordinates) always excluded from the diff (OS overlays such as the gesture pill). */
  masks?: Region[];
  /** Excluded only when running on the fake fixture: where the screenshot shows personal data. */
  fakeMasks?: Region[];
}

const AUTH_APP: [number, number] = [78, 2296]; // 739.333 CSS px

// In-app screens are 1080 x 2400 (360 x 800 CSS px). The band starts below the status-bar icons; the gesture pill
// is masked. The app draws under both bars (--safe-top 26 px, --safe-bottom 14.667 px, as on the phone).
const IN_APP: Pick<ScreenSpec, 'app' | 'viewport' | 'screenHeight' | 'cssVars' | 'masks'> = {
  app: [105, 2400],
  viewport: 'screen',
  screenHeight: 800,
  cssVars: { '--safe-top': '26px', '--safe-bottom': '14.667px' },
  masks: [{ name: 'gesture pill', rect: [355, 2250, 370, 35] }],
};

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
  {
    id: 'home',
    ref: '04-home.png',
    route: '/home',
    ...IN_APP,
    colorScheme: 'dark',
    time: '2026-11-03T17:20:00+05:30',
    timezone: 'Asia/Kolkata',
    fixture: 'home',
    scrollX: [{ selector: '[data-testid="quick-actions"]', left: 27.333 }],
    fakeMasks: [{ name: 'first name in the greeting', rect: [548, 155, 532, 95] }],
    regions: [
      { name: 'logo tile', rect: [40, 5, 100, 100], zoom: true },
      { name: 'institution name', rect: [150, 35, 480, 45] },
      { name: 'greeting (no name)', rect: [45, 150, 495, 85] },
      { name: 'date', rect: [40, 245, 405, 58] },
      { name: 'QUICK ACTIONS', rect: [45, 450, 315, 45] },
      { name: 'chips row', rect: [0, 515, 1080, 140] },
      { name: 'chip 2 content', rect: [480, 545, 380, 80] },
      { name: 'APPS', rect: [45, 717, 160, 45] },
      { name: 'card', rect: [30, 870, 1020, 430] },
      { name: 'app tiles', rect: [100, 835, 880, 180] },
      { name: 'app labels', rect: [80, 1020, 920, 115] },
      { name: 'tab icons', rect: [0, 2065, 1080, 85] },
      { name: 'tab labels', rect: [0, 2150, 1080, 60] },
    ],
  },
  {
    id: 'notifications',
    ref: '05-notifications.png',
    route: '/notifications',
    ...IN_APP,
    colorScheme: 'dark',
    time: '2026-11-03T17:21:00+05:30',
    timezone: 'Asia/Kolkata',
    fixture: 'notifications',
    regions: [
      { name: 'title', rect: [40, 35, 440, 75] },
      { name: 'header edge', rect: [0, 140, 1080, 25] },
      { name: 'date 1', rect: [40, 215, 260, 45] },
      { name: 'row 1', rect: [0, 282, 1080, 191] },
      { name: 'dot 1', rect: [40, 330, 40, 40] },
      { name: 'title 1', rect: [100, 320, 420, 60] },
      { name: 'time 1', rect: [100, 387, 175, 45] },
      { name: 'chevron 1', rect: [985, 325, 45, 50], zoom: true },
      { name: 'read row', rect: [0, 596, 1080, 191] },
      { name: 'emoji', rect: [100, 635, 65, 65], zoom: true },
      { name: 'read title', rect: [160, 630, 420, 70] },
      { name: 'group 3', rect: [0, 911, 1080, 572] },
      { name: 'tab icons', rect: [0, 2065, 1080, 85] },
      { name: 'tab labels', rect: [0, 2150, 1080, 60] },
      { name: 'badge', rect: [410, 2068, 90, 50], zoom: true },
    ],
  },
  {
    id: 'help',
    ref: '06-contact-support.png',
    route: '/support',
    ...IN_APP,
    colorScheme: 'dark',
    time: '2026-11-03T17:21:00+05:30',
    timezone: 'Asia/Kolkata',
    fixture: 'help',
    regions: [
      { name: 'title', rect: [40, 40, 170, 75] },
      { name: 'subtitle', rect: [40, 155, 1000, 120] },
      { name: 'contact card + glow', rect: [0, 300, 1080, 330] },
      { name: 'phone tile', rect: [90, 390, 135, 135], zoom: true },
      { name: 'contact text', rect: [250, 375, 520, 200] },
      { name: 'arrow', rect: [925, 430, 65, 60], zoom: true },
      { name: 'faq card', rect: [30, 640, 1020, 245] },
      { name: 'question tile', rect: [95, 702, 125, 125], zoom: true },
      { name: 'faq text', rect: [245, 690, 620, 170] },
      { name: 'chevron', rect: [935, 740, 45, 55] },
      { name: 'video line', rect: [225, 945, 630, 60], zoom: true },
      { name: 'tab icons', rect: [0, 2065, 1080, 85] },
      { name: 'tab labels', rect: [0, 2150, 1080, 60] },
    ],
  },
  {
    id: 'profile',
    ref: '07-profile.png',
    route: '/profile',
    ...IN_APP,
    colorScheme: 'dark',
    time: '2026-11-03T17:21:00+05:30',
    timezone: 'Asia/Kolkata',
    fixture: 'profile',
    fakeMasks: [
      { name: 'name', rect: [355, 235, 600, 62] },
      { name: 'phone', rect: [420, 428, 240, 52] },
      { name: 'email', rect: [420, 495, 560, 52] },
    ],
    regions: [
      { name: 'title', rect: [40, 40, 330, 75] },
      { name: 'avatar + badge', rect: [100, 225, 230, 230], zoom: true },
      { name: 'name', rect: [355, 235, 600, 62] },
      { name: 'room chip', rect: [355, 315, 340, 80], zoom: true },
      { name: 'contact icons', rect: [355, 425, 70, 125] },
      { name: 'qr panel', rect: [95, 590, 890, 215] },
      { name: 'qr tile', rect: [125, 630, 135, 135], zoom: true },
      { name: 'qr text', rect: [280, 620, 480, 170] },
      { name: 'ACCOUNT', rect: [45, 880, 220, 45] },
      { name: 'account card', rect: [40, 935, 1000, 575] },
      { name: 'row icons', rect: [110, 980, 100, 520] },
      { name: 'row labels', rect: [240, 1000, 400, 480] },
      { name: 'app card', rect: [40, 1625, 1000, 400] },
      { name: 'tab avatar', rect: [860, 2060, 140, 140], zoom: true },
      { name: 'tab labels', rect: [0, 2150, 1080, 60] },
    ],
  },
  {
    id: 'profile-end',
    ref: '07-profile(1).png',
    route: '/profile',
    ...IN_APP,
    colorScheme: 'dark',
    time: '2026-11-03T17:22:00+05:30',
    timezone: 'Asia/Kolkata',
    fixture: 'profile',
    scrollY: 'end',
    fakeMasks: [
      { name: 'name', rect: [355, 235, 600, 62] },
      { name: 'phone', rect: [420, 428, 240, 52] },
      { name: 'email', rect: [420, 495, 560, 52] },
    ],
    regions: [
      { name: 'sticky card', rect: [40, 160, 1000, 690] },
      { name: 'sticky edge (clipped list)', rect: [0, 835, 1080, 60], zoom: true },
      { name: 'app card', rect: [40, 1245, 1000, 405] },
      { name: 'sign out', rect: [40, 1700, 1000, 210] },
      { name: 'sign out tile', rect: [110, 1750, 110, 110], zoom: true },
    ],
  },
  {
    // Entry Pass over My Profile. The QR's data modules depend on the token, which is new every 10 s, so they are
    // masked: the three finder corners (with the format bits, mask 2 in both), the card and its padding are compared.
    // Module grid from docs/ui-measurements.md §14 (canvas 512 px, margin 1, shown at 199.333 x 199 from (80.347, 430.641)).
    id: 'entry-pass',
    ref: 'QR_entry-pass.png',
    route: '/profile/entry-pass',
    ...IN_APP,
    colorScheme: 'dark',
    time: '2026-11-03T17:22:00+05:30',
    timezone: 'Asia/Kolkata',
    fixture: 'profile',
    qrToken: '_aR3GHRHby_Zhj2JP0FwivCRovmnCMHpFSIW5YlBkT2XC_PxY3L2.YHQPNnpv8aBo5_hOkmoqVTHCPIO0ihQBNzzZJkBFN6A',
    clockAfterLoad: '2026-11-03T17:22:01.320+05:30', // 8.68 s left: "Expires in 9s", the arc ending at 312.5°
    masks: [
      ...IN_APP.masks!,
      { name: 'QR data, rows 0-8 between the top finders', rect: [380, 1200, 335, 128] },
      { name: 'QR data, rows 9-32', rect: [254, 1326, 573, 334] },
      { name: 'QR data, rows 33-40 right of the bottom finder', rect: [380, 1659, 447, 113] },
    ],
    fakeMasks: [
      { name: 'profile name', rect: [355, 235, 600, 62] },
      { name: 'profile phone', rect: [420, 428, 240, 52] },
      { name: 'profile email', rect: [420, 495, 560, 52] },
      { name: 'sheet name', rect: [55, 953, 600, 66] },
    ],
    regions: [
      { name: 'dimmed profile', rect: [0, 0, 1080, 828] },
      { name: 'sheet top edge', rect: [0, 815, 1080, 60], zoom: true },
      { name: 'ENTRY PASS', rect: [55, 895, 240, 45] },
      { name: 'name', rect: [55, 953, 600, 66] },
      { name: 'room', rect: [55, 1035, 270, 55] },
      { name: 'close', rect: [920, 875, 130, 130], zoom: true },
      { name: 'qr card', rect: [195, 1140, 690, 690] },
      { name: 'qr top-left corner', rect: [195, 1145, 200, 200], zoom: true },
      { name: 'qr bottom-right corner', rect: [700, 1675, 185, 160], zoom: true },
      { name: 'countdown', rect: [360, 1890, 380, 110], zoom: true },
      { name: 'ring', rect: [365, 1900, 90, 90], zoom: true },
      { name: 'footer', rect: [80, 2030, 925, 65] },
    ],
  },
];
