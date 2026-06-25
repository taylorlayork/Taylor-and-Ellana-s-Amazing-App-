const CACHE_NAME = 'across-static-v54';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './supabase-config.js', './icons/icon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './preview-image.png'];
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  const freshFirst = ['/', '/index.html', '/app.js', '/styles.css', '/supabase-config.js', '/manifest.webmanifest'];
  const path = url.pathname.replace(/\/+/g, '/');
  const shouldFetchFresh = freshFirst.some(item => path.endsWith(item));
  if (shouldFetchFresh) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
