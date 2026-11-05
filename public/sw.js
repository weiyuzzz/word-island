/* Word Island service worker (v2):
 * Clean up old caches that may have stored stale Next.js static chunks across rebuilds,
 * and only cache stable public icons/manifest. Never intercept HTML/RSC navigation or /_next/ chunks.
 */
const CACHE = "word-island-v2";
const PRECACHE = ["/icon.svg", "/icon-maskable.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req)),
    );
  }
});
