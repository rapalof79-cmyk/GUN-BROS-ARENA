/* GUN BROS 3D — offline cache.
 *
 * Three.js, the game, the styles and the icons are the whole game (there are
 * no image or audio downloads at runtime — every texture and sound is
 * generated in code), so caching these files is enough to play with the phone
 * in aeroplane mode.
 *
 * Strategy:
 *   navigation  -> network first, cache as fallback (so a new build appears
 *                  on the next load when online, and the old one still opens
 *                  offline)
 *   everything else -> cache first, fill the cache in the background
 */
const VERSION = 'v22';
const CACHE = 'gunbros-' + VERSION;
const PRECACHE = [
  './',
  './index.html',
  './style.css?v=22',
  './game.js?v=22',
  './vendor/three.module.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Straight network pass-through while online; the cached copy only answers
    // when the network is gone. Keeping this branch minimal is deliberate —
    // the page must always load normally when there is a connection.
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE);
        const hit = (await cache.match('./index.html')) || (await cache.match('./'));
        return hit || offlinePage();
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => new Response('', { status: 504, statusText: 'offline' }));
    })
  );
});

function offlinePage() {
  return new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="margin:0;background:#0a0705;color:#d9c6ff;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;height:100vh;text-align:center">' +
    '<div><h1 style="font-size:20px;letter-spacing:.18em">GUN BROS ARENA</h1>' +
    '<p style="opacity:.75">The game is still downloading its files.<br>Reconnect once, then it plays offline.</p></div></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
