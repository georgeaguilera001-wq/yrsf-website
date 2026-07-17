/**
 * YRSF Main Website — Service Worker
 * Enables PWA installation and offline caching.
 */

const CACHE_NAME = 'yrsf-main-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/boats.html',
  '/css/shared.css',
  '/js/pages/home.js'
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
