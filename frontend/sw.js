// BUFIN Service Worker - Offline Caching & App Shell Acceleration
const CACHE_NAME = 'bufin-v3.7-cache';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/login.css',
  '/css/invoice.css',
  '/js/app.js',
  '/js/modules/utils.js',
  '/js/modules/state.js',
  '/js/modules/components.js',
  '/js/modules/actions.js',
  '/js/modules/offline_store.js',
  '/js/modules/mobile.js',
  '/js/views/login.js',
  '/js/views/overview.js',
  '/manifest.json',
  '/icons/favicon.svg',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  '/svg/app-icon.svg'
];

// Install: Pre-cache core app shell
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[SW] Pre-cache warning:', err);
      });
    })
  );
});

// Activate: Clean up previous caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for static assets, Network-First for state API
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests and Cloudinary/external analytics
  if (req.method !== 'GET') return;

  // 1. API state requests: Network-First with Cache fallback
  if (url.pathname.startsWith('/api/state')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(JSON.stringify({ version: 0, data: null, offline: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // 2. Static Assets (CSS, JS, Fonts, Images, SVG): Network-First when online, Cache fallback when offline
  event.respondWith(
    fetch(req)
      .then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return networkRes;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
      })
  );
});
