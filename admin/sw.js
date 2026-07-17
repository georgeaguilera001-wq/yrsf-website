/**
 * YRSF Admin Portal — Service Worker
 * Enables PWA installation and offline caching.
 */

const CACHE_NAME = 'yrsf-admin-v2';
const ASSETS_TO_CACHE = [
  '/admin/dashboard.html',
  '/admin/index.html',
  '/css/shared.css',
  '/css/admin.css',
  '/js/pages/admin-dashboard.js',
  '/js/config/supabase.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('SW cache add skipped:', asset, err);
        }
      }
    })
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
  if (event.request.url.includes('supabase.co') || event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
