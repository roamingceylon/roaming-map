const CACHE_VERSION = "v1.0.11";
const CACHE_NAME = `roaming-map-cache-${CACHE_VERSION}`;
const MAP_TILES_CACHE = `map-tiles-cache-${CACHE_VERSION}`;
const DATA_CACHE = `data-cache-${CACHE_VERSION}`;

// Data cache configuration
const DATA_CONFIG = {
  maxAge:  60 * 60 * 24 * 1000, // 24 hours
  version: '1.0.4' // Increment this when map-data.json structure changes
};


const BASE_PATH = self.location.pathname.replace(/\/[^\/]*$/, '');

const ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/venue.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/css/map.css`,
  `${BASE_PATH}/js/map-app.js`,
  `${BASE_PATH}/icons/icon-192.png`,
  `${BASE_PATH}/icons/icon-512.png`,
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js",
  "https://unpkg.com/leaflet.markercluster/dist/leaflet.markercluster.js",
  "https://unpkg.com/leaflet.markercluster/dist/MarkerCluster.css",
  "https://unpkg.com/leaflet.markercluster/dist/MarkerCluster.Default.css",
];

// Enhanced Sri Lanka map tiles with correct coordinate calculations
function generateSriLankaTiles() {
  const tiles = [];
  
  // Sri Lanka bounding box: approximately 5.9°N to 9.9°N, 79.7°E to 81.9°E
  // Using more conservative and accurate tile coordinates
  const tileRanges = {
    6: { x: [46, 47], y: [30, 31] },      // Zoom 6: very broad view
    7: { x: [92, 94], y: [60, 62] },      // Zoom 7: regional view  
    8: { x: [184, 188], y: [120, 124] },  // Zoom 8: country view
    9: { x: [368, 375], y: [241, 247] },  // Zoom 9: detailed view (corrected)
    10: { x: [737, 750], y: [483, 494] }  // Zoom 10: city level (corrected)
  };
  
  // Cache fewer tiles initially, focusing on essential coverage
  Object.entries(tileRanges).forEach(([zoom, coords]) => {
    const zoomLevel = parseInt(zoom);
    
    // For higher zoom levels, cache fewer tiles to avoid 404s
    const maxTiles = zoomLevel >= 9 ? 20 : 50;
    let tileCount = 0;
    
    for (let x = coords.x[0]; x <= coords.x[1] && tileCount < maxTiles; x++) {
      for (let y = coords.y[0]; y <= coords.y[1] && tileCount < maxTiles; y++) {
        // Only add tiles from one CDN to reduce pre-cache size
        tiles.push(`https://a.basemaps.cartocdn.com/light_all/${zoomLevel}/${x}/${y}@2x.png`);
        tileCount++;
      }
    }
  });
  
  return tiles;
}


self.addEventListener("install", event => {
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)),
      // Pre-cache critical map tiles
      caches.open(MAP_TILES_CACHE).then(cache => {
        const criticalTiles = generateSriLankaTiles().slice(0, 50); // Cache first 50 tiles
        return cache.addAll(criticalTiles);
      })
    ])
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      const validCaches = [CACHE_NAME, MAP_TILES_CACHE, DATA_CACHE];
      return Promise.all(
        keys.map(key => {
          if (!validCaches.includes(key)) {
            console.log('Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle navigation requests
  if (request.mode === "navigate") {
    if (url.pathname.includes("venue.html")) {
      event.respondWith(
        caches.match(`${BASE_PATH}/venue.html`).then(response => {
          return response || fetch(`${BASE_PATH}/venue.html`);
        })
      );
      return;
    }
  }

  // Handle map-data.json with versioning and staleness check
  if (request.url.includes("map-data.json")) {
    event.respondWith(handleDataRequest(request));
    return;
  }

  // Handle map tiles with aggressive caching
  if (url.hostname.includes("cartocdn.com") || url.hostname.includes("openstreetmap.org")) {
    event.respondWith(handleTileRequest(request));
    return;
  }

  // Handle static assets (cache-first)
  if (request.url.includes(BASE_PATH) || 
      request.url.includes("unpkg.com") || 
      request.url.includes("fonts.googleapis.com")) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // Default: network-first for other requests
  event.respondWith(fetch(request));
});

// Handle map-data.json with smart caching and version checking
async function handleDataRequest(request) {
  const cache = await caches.open(DATA_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    const cachedTime = cachedResponse.headers.get('sw-cached-at');
    if (cachedTime && (Date.now() - parseInt(cachedTime)) < DATA_CONFIG.maxAge) {
      // Serve from cache, but check for updates in background
      checkForDataUpdates(request, cache);
      return cachedResponse;
    }
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-at', Date.now().toString());
      headers.set('sw-cache-version', DATA_CONFIG.version);
      
      const cachedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });
      
      cache.put(request, cachedResponse);
      return networkResponse;
    }
  } catch (error) {
    console.log('Network failed, serving from cache if available');
  }

  // Fallback to cache or empty array
  return cachedResponse || new Response("[]", {
    headers: { "Content-Type": "application/json" }
  });
}

// Handle map tiles with long-term caching and error handling
async function handleTileRequest(request) {
  const cache = await caches.open(MAP_TILES_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful tiles for a very long time (30 days)
      const headers = new Headers(networkResponse.headers);
      headers.set('Cache-Control', 'public, max-age=2592000');
      headers.set('sw-cached-at', Date.now().toString());
      
      const responseToCache = new Response(await networkResponse.blob(), {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: headers
      });
      
      cache.put(request, responseToCache.clone());
      return responseToCache;
    } else if (networkResponse.status === 404) {
      // Don't cache 404 responses, but return them to prevent retries
      console.log('Tile not found (404):', request.url);
      return networkResponse;
    } else {
      console.log('Tile request failed with status:', networkResponse.status, request.url);
      return networkResponse;
    }
  } catch (error) {
    console.log('Tile network error:', error.message, request.url);
    // Return a fallback response for network errors
    return new Response('', { 
      status: 404, 
      statusText: 'Tile not available offline' 
    });
  }
}

// Handle static assets (CSS, JS, images)
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    if (request.mode === "navigate") {
      return caches.match(`${BASE_PATH}/index.html`);
    }
    return new Response("Resource not available offline", { status: 503 });
  }
}

// Background check for data updates
async function checkForDataUpdates(request, cache) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const networkData = await networkResponse.text();
      const cachedResponse = await cache.match(request);
      const cachedData = await cachedResponse.text();
      
      if (networkData !== cachedData) {
        console.log('Data updated, refreshing cache');
        const headers = new Headers(networkResponse.headers);
        headers.set('sw-cached-at', Date.now().toString());
        
        const updatedResponse = new Response(networkData, {
          status: networkResponse.status,
          statusText: networkResponse.statusText,
          headers: headers
        });
        
        cache.put(request, updatedResponse);
        
        // Notify clients about data update
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'DATA_UPDATED' });
          });
        });
      }
    }
  } catch (error) {
    console.log('Background update check failed');
  }
}