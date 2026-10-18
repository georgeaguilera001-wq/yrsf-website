/**
 * YRSF Admin Portal — Service Worker
 * Network-First caching strategy ensures the app ALWAYS loads live updates instantly
 * while falling back cleanly to cached versions when offline.
 */

const CACHE_NAME = 'yrsf-admin-v17';
const ASSETS_TO_CACHE = [
  '/admin/dashboard.html',
  '/admin/index.html',
  '/admin/change-password.html',
  '/css/tailwind.css',
  '/css/shared.css',
  '/css/admin.css',
  '/img/logo-wide.png',
  '/admin/logo.png',
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

// Stale-While-Revalidate for static assets (CSS, images, fonts) so styling loads in 0ms!
// Network-First for HTML/APIs to guarantee live dashboard updates with offline cache fallback.
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('supabase.co') || event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  const isStaticAsset = url.pathname.startsWith('/css/') ||
                        url.pathname.startsWith('/img/') ||
                        url.pathname.endsWith('.png') ||
                        url.pathname.endsWith('.jpg') ||
                        url.pathname.endsWith('.jpeg') ||
                        url.pathname.endsWith('.svg') ||
                        url.pathname.endsWith('.woff2');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('/admin/dashboard.html');
        }
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
        icon: '/admin/logo.png',
        badge: '/admin/logo.png',
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



