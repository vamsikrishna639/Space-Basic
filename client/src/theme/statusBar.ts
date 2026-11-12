// The phone's status bar colour, through <meta name="theme-color"> (decisions.md 2026-11-11).
//
// In the installed Android app (a Trusted Web Activity) Chrome paints the status bar with the page's theme-color
// on the verified origin; the APK's own colour is only the fallback before the page sets one. In the original app
// the screens are edge-to-edge, so the status bar shows whatever is at the top of the screen. Measured on the
// screenshots (ui-measurements.md §16): the page background, the Home header, the dimmed page
// under the Entry Pass sheet, and #FAFAFA on the sign-in screens. The colours live in tokens.css; this only picks
// which token is at the top of the current screen and copies its value into the meta tag.
//
// The navigation bar (bottom) can't be set from a page: it comes from the APK alone (android/twa-manifest.json).

export type TopEdge = 'auth' | 'page' | 'hero' | 'sheet';

/** The token whose colour is at the top of each kind of screen. */
export const TOP_EDGE_TOKEN: Record<TopEdge, string> = {
  auth: '--statusbar-auth',
  page: '--app-bg',
  hero: '--hero-top',
  sheet: '--statusbar-sheet',
};

/** Signed-out routes (App.tsx, PublicOnly): always light, whatever the appearance setting. */
const AUTH = /^\/(?:$|sign-in(?:\/|$)|forgot-password(?:\/|$))/;

/** What is at the top of the screen at `pathname`. Unknown routes redirect, so they get the page colour. */
export function topEdgeFor(pathname: string): TopEdge {
  if (AUTH.test(pathname)) return 'auth';
  if (pathname === '/home') return 'hero';
  if (pathname === '/profile/entry-pass') return 'sheet';
  return 'page';
}

let meta: HTMLMetaElement | null = null;

function themeMeta(): HTMLMetaElement {
  if (meta?.isConnected) return meta;
  meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  return meta;
}

/** Set theme-color for `pathname` from the tokens of the theme currently on <html data-theme>. */
export function applyStatusBar(pathname: string): void {
  const edge = topEdgeFor(pathname);
  const value = getComputedStyle(document.documentElement).getPropertyValue(TOP_EDGE_TOKEN[edge]).trim();
  if (!value) return; // tokens not loaded yet: keep the current colour
  const tag = themeMeta();
  if (tag.content !== value) tag.content = value;
}

interface RouterLike {
  state: { location: { pathname: string } };
  subscribe(fn: (state: { location: { pathname: string } }) => void): () => void;
}

/**
 * Keep theme-color in step with the route and the theme. Route changes come from the router; theme changes
 * (Settings > Appearance, or the phone's setting under "System") show up as a new data-theme on <html>.
 */
export function syncStatusBar(router: RouterLike): () => void {
  const apply = () => applyStatusBar(router.state.location.pathname);
  apply();
  const unsubscribe = router.subscribe(apply);
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    unsubscribe();
    observer.disconnect();
  };
}
