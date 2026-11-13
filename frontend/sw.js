// BUFIN Service Worker - Offline Caching & App Shell Acceleration
const CACHE_NAME = 'bufin-v17.0-cache';

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
  '/icons/maskable-icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/svg/app-icon.svg',
  '/svg/logo.svg'
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

// Message handler: e.g. PURGE_API_CACHE
self.addEventListener('message', event => {
  if (event.data === 'PURGE_API_CACHE' || (event.data && event.data.type === 'PURGE_API_CACHE')) {
    event.waitUntil((async () => {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const request of keys) {
          const u = new URL(request.url);
          if (u.pathname.startsWith('/api/')) {
            await cache.delete(request);
          }
        }
      }
    })());
  }
});

// Fetch: Never cache /api/* responses (return 503 on offline), Network-First for JS/HTML assets
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests
  if (req.method !== 'GET') return;

  // 1. API state requests (/api/state and /api/*): Direct network ONLY. Never cache. Return 503 JSON on offline/network failure.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({ error: 'Service Unavailable (Offline)', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 2. Static Assets (HTML, CSS, JS, Fonts, Images, SVG): Network-First with Cache Fallback
  event.respondWith((async () => {
    try {
      const networkRes = await fetch(req);
      if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
        const resClone = networkRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
      }
      return networkRes;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const htmlCached = (await caches.match('/index.html')) || (await caches.match('/'));
        if (htmlCached) return htmlCached;
      }
      throw err;
    }
  })());
});
