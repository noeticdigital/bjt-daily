// Hand-written service worker for BJT Daily.
// - HTML navigations: NETWORK-FIRST (so a new deploy loads immediately when online),
//   falling back to the cached page only when offline.
// - Hashed JS/CSS: stale-while-revalidate (filenames change per build, so this is safe).
// - Audio/images: cache-first, kept forever so listening works offline (spec §4).

const CACHE = "bjt-daily-v2";
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

  // HTML navigations: network-first so updates appear immediately; cache is offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (
            (await cache.match(req)) ||
            (await cache.match("./index.html")) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

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
        } catch {
          return hit || Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed JS/CSS (and items.json): stale-while-revalidate.
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
      return cached || (await network) || Response.error();
    })(),
  );
});
