// Service worker: preloads the whole app including the puzzle bank, so it is
// fully playable offline. Everything is fetched network first; the cache is
// used offline or after a 4 s timeout. Updates are silent.
// The deploy stamps the version x.yy.zzz into VERSION.
const VERSION = '__VERSION__';
const CACHE = `sudoku-${VERSION}`;

// The deploy replaces this list with every uploaded file.
const FILES = /*__FILES__*/['./', 'index.html', 'css/app.css', 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
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
  if (url.origin !== self.location.origin) return;

  // Network first, so that HTML, CSS and JS always come from the same deploy.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' });
      const res = await withTimeout(net, 4000);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true }))
        || (req.mode === 'navigate' ? await cache.match(new URL('index.html', self.registration.scope).href) : null)
        || Response.error();
    }
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
