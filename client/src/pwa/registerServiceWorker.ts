/**
 * Registers public/sw.js (installability for Android, the Trusted Web Activity and desktop; docs/decisions.md 2026-11-09)
 * in production builds only, after the page has loaded, so it never competes with the first render. The worker
 * stores nothing and only adds an offline page for failed page loads.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
  });
}
