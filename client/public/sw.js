/*
 * Space Basic service worker: the minimum for installing the app (Android, Trusted Web Activity, desktop).
 * Plain JavaScript, no dependency (docs/decisions.md, 2026-11-09).
 *
 * - It stores NOTHING: no Cache Storage, no API responses, no QR, so nothing outlives a sign-out or
 *   "Clear stored data".
 * - Only page loads (navigations) go through it: always the network (with navigation preload, so no extra
 *   delay), and a small built-in "You're offline" page when the network fails. API calls, scripts, styles,
 *   fonts and images are not touched at all, so the app behaves and looks exactly as without it.
 * - The full PWA step (app shell precache, online/offline indicator) replaces this later (SPEC.md).
 */
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#384BD5">
<title>Space Basic</title>
<style>
  :root { color-scheme: light dark; --bg: #f5f6fa; --card: #ffffff; --line: #eeeef0; --text: #13161f; --text-2: #6d717d; }
  @media (prefers-color-scheme: dark) { :root { --bg: #101116; --card: #181b24; --line: #2a2d36; --text: #edeef3; --text-2: #a3a9b7; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text);
    font-family: 'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', system-ui, sans-serif; }
  main { width: 100%; max-width: 328px; padding: 24px 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--card); text-align: center; }
  h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  p { margin: 0 0 20px; color: var(--text-2); font-size: 14px; line-height: 20px; }
  button { width: 100%; height: 48px; border: 0; border-radius: 12px; background: #384bd5; color: #fff; font: inherit; font-size: 15px; font-weight: 500; }
</style>
</head>
<body>
<main>
  <h1>You're offline</h1>
  <p>Space Basic needs an internet connection. Check your Wi-Fi or mobile data, then try again.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // everything else goes to the network untouched
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      return preloaded || (await fetch(event.request));
    } catch {
      return new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  })());
});
