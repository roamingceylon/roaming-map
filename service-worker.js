const CACHE_NAME = "roaming-map-cache-v2";

// Static assets to pre-cache
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/data/map-data.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js",
  // add your local CSS/JS files if any, e.g., "/main.css", "/app.js"
];

// Dynamically generate Sri Lanka tile coverage (zoom 7–9)
function generateSriLankaTiles() {
  const tiles = [];
  const zooms = [7, 8, 9];
  const ranges = {
    7: { x: [92, 94], y: [60, 62] },
    8: { x: [184, 188], y: [120, 124] },
    9: { x: [368, 376], y: [240, 248] }
  };

  for (const z of zooms) {
    const { x, y } = ranges[z];
    for (let i = x[0]; i <= x[1]; i++) {
      for (let j = y[0]; j <= y[1]; j++) {
        tiles.push(`https://b.basemaps.cartocdn.com/light_all/${z}/${i}/${j}@2x.png`);
      }
    }
  }

  return tiles;
}

// Add tile URLs to ASSETS
ASSETS.push(...generateSriLankaTiles());

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn("Some resources failed to cache:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;

  // Only cache GET requests
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then(cachedRes => {
      if (cachedRes) return cachedRes;

      return fetch(request)
        .then(networkRes => {
          // Cache map tiles and data.json dynamically
          if (
            request.url.includes("map-data.json") ||
            request.url.includes("cartocdn.com") ||
            request.url.endsWith(".js") ||
            request.url.endsWith(".css")
          ) {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkRes.clone());
              return networkRes;
            });
          }
          return networkRes;
        })
        .catch(() => {
          // Fallback for offline
          if (request.url.endsWith("map-data.json")) {
            return new Response(JSON.stringify([]), {
              headers: { "Content-Type": "application/json" }
            });
          }
          return new Response("You are offline", { status: 503 });
        });
    })
  );
});