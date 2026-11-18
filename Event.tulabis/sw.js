/* OrgPass service worker: offline-first app shell + CDN libraries. */
const CACHE = 'orgpass-v2';
const SHELL = ['./', './index.html', './manifest.json'];
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})));
    // no-cors keeps CDN scripts cacheable (opaque responses still work in <script> tags)
    await Promise.all(CDN.map(async (u) => {
      try { await cache.put(u, await fetch(new Request(u, { mode: 'no-cors' }))); } catch (e) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch Google Apps Script traffic: the app handles its own offline queue.
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Page loads: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else: cache first, refresh in the background.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const refresh = fetch(req).then(async (res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    return cached || (await refresh) || Response.error();
  })());
});