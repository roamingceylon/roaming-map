const CACHE_VERSION = "v1.0.0";
const CACHE_NAME = `roaming-map-cache-${CACHE_VERSION}`;

const BASE_PATH = self.location.pathname.replace(/\/[^\/]*$/, '');

const ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/venue.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/data/map-data.json`,
  `${BASE_PATH}/icons/icon-192.png`,
  `${BASE_PATH}/icons/icon-512.png`,
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js",
];

// ✅ Optional: add a few Sri Lanka map tiles
function generateSriLankaTiles() {
  const tiles = [];
  const zooms = [8];
  for (let x = 184; x <= 188; x++) {
    for (let y = 120; y <= 124; y++) {
      tiles.push(`https://b.basemaps.cartocdn.com/light_all/8/${x}/${y}@2x.png`);
    }
  }
  return tiles;
}
ASSETS.push(...generateSriLankaTiles());

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // 🧠 Intercept SPA-style navigation to venue.html?id=123
  if (request.mode === "navigate" && url.pathname.endsWith("venue.html")) {
    event.respondWith(
      caches.match(`${BASE_PATH}/venue.html`).then(resp => {
        return resp || fetch(`${BASE_PATH}/venue.html`);
      })
    );
    return;
  }

  // ✅ Cache-first for everything else
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(networkRes => {
          if (
            request.url.endsWith(".js") ||
            request.url.endsWith(".css") ||
            request.url.includes("map-data.json") ||
            request.url.includes("cartocdn.com")
          ) {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkRes.clone());
              return networkRes;
            });
          }
          return networkRes;
        })
        .catch(() => {
          if (request.url.includes("map-data.json")) {
            return new Response("[]", { headers: { "Content-Type": "application/json" } });
          }
          return new Response("Offline", { status: 503 });
        });
    })
  );
});