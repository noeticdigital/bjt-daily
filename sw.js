// Hand-written service worker for BJT Daily.
// Single user, local-first: app shell is cached on first visit (stale-while-revalidate),
// audio/image assets use cache-first so listening works offline on a train (spec §4).

const CACHE = "bjt-daily-v1";
const AUDIO_CACHE = "bjt-audio-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== AUDIO_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return /\.(mp3|wav|m4a|ogg|png|jpg|jpeg|webp|svg)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (fonts) pass through

  // Media/images: cache-first, keep forever (verified, immutable content).
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(AUDIO_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return hit || Response.error();
        }
      })(),
    );
    return;
  }

  // App shell + JS/CSS: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      // Navigations: fall back to cached index when offline.
      if (req.mode === "navigate") {
        return cached || (await network) || cache.match("./index.html");
      }
      return cached || (await network) || Response.error();
    })(),
  );
});
