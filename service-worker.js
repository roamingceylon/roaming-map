const VERSION = "v4.5"; // 🔁 Change this to trigger a new version
const CACHE_NAME = `roaming-map-cache-${VERSION}`;

const ASSETS = [
  "/",
  "/index.html",
  "/venue.html",
  "/manifest.json",
  "/data/map-data.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js"
];

// Add pre-defined map tiles for Sri Lanka (zoom 7–9)
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

ASSETS.push(...generateSriLankaTiles());

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn("Some resources failed to cache:", err);
      });
    })
  );
  self.skipWaiting(); // activate new SW immediately
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

  // 1. Serve venue.html on navigation to venue pages
 // Intercept all navigations
  if (request.mode === "navigate") {
    const url = new URL(request.url);

    // If navigating to venue.html (with or without query params)
    if (url.pathname === '/venue.html') {
      event.respondWith(
        caches.match('/venue.html').then(cached => {
          return cached || fetch('/venue.html');
        })
      );
      return;
    }
  }

  // 2. Cache-first for other assets
  if (request.method === "GET") {
    event.respondWith(
      caches.match(request).then(cachedRes => {
        if (cachedRes) return cachedRes;

        return fetch(request)
          .then(networkRes => {
            // Dynamically cache JSON, CSS, JS, tile requests
            if (
              request.url.includes("map-data.json") ||
              request.url.includes("cartocdn.com") ||
              request.url.endsWith(".js") ||
              request.url.endsWith(".css")
            ) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, networkRes.clone());
              });
            }
            return networkRes;
          })
          .catch(() => {
            if (request.url.endsWith("map-data.json")) {
              return new Response(JSON.stringify([]), {
                headers: { "Content-Type": "application/json" }
              });
            }
            return new Response("You are offline", { status: 503 });
          });
      })
    );
  }
});

// Handle skipWaiting from app
self.addEventListener("message", event => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});