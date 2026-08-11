/**
 * YRSF Main Website — Service Worker
 * Network-First caching strategy ensures the site ALWAYS loads live updates instantly
 * while falling back cleanly to cached versions when offline.
 */

const CACHE_NAME = 'yrsf-main-v20';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/boats.html',
  '/css/shared.css',
  '/js/pages/home.js'
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

// Network-First strategy: Always fetch live code first so changes show instantly!
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('supabase.co') || event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
      })
  );
});

// Web Push Protocol handlers
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const payload = event.data.json();
      const options = {
        body: payload.body || 'You have a new reservation.',
        icon: '/images/favicon.png',
        badge: '/images/favicon.png',
        vibrate: [200, 100, 200],
        data: payload.url || '/admin/dashboard.html'
      };
      
      event.waitUntil(
        self.registration.showNotification(payload.title || 'YRSF New Booking', options)
      );
    } catch (err) {
      console.error('Error parsing push payload:', err);
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || '/admin/dashboard.html';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
