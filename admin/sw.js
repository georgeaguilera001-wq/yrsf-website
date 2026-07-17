/**
 * YRSF Admin Portal — Service Worker
 * Enables PWA installation and offline caching for static assets.
 */

const CACHE_NAME = 'yrsf-admin-v1';
const ASSETS_TO_CACHE = [
  '/admin/dashboard.html',
  '/admin/index.html',
  '/css/shared.css',
  '/css/admin.css',
  '/js/pages/admin-dashboard.js',
  '/js/config/supabase.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Network first for API/Supabase calls, cache fallback for static assets
  if (event.request.url.includes('supabase.co') || event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
