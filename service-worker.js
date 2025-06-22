const CACHE_NAME = "roaming-map-cache-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/data/map-data.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js",
  // Your own CSS/JS

];

// Optional: Pre-cache CartoDB Sri Lanka tiles (zoom 7–9 range)
const TILE_URL_PREFIX = "https://b.basemaps.cartocdn.com/light_all";
const TILE_ZOOM = 8;
const TILE_XY = [
  [176, 126], [177, 126], [178, 126],
  [176, 127], [177, 127], [178, 127]
];
TILE_XY.forEach(([x, y]) => {
  ASSETS.push(`${TILE_URL_PREFIX}/${TILE_ZOOM}/${x}/${y}@2x.png`);
});

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request)
    )
  );
});