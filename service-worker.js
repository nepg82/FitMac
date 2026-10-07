const CACHE_NAME = 'tracker-cache-v1.0.12';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/charts.js',
  './js/github-api.js',
  './js/dashboard.js',
  './js/meals.js',
  './js/weight.js',
  './js/weight-export.js',
  './js/workout.js',
  './js/sync.js',
  './js/app.js',
  './app-icons/app-icon-192.png',
  './app-icons/app-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && !k.startsWith('tablet-')).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Only handle same-origin app assets. Cross-origin requests (notably the
  // GitHub API) must always hit the network — otherwise the cache-first
  // strategy below serves stale sync data.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});