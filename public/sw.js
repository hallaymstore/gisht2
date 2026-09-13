const CACHE = 'automix-ai-v1.1-static';
const STATIC = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); return response;
  }).catch(() => caches.match(event.request).then(r => r || caches.match('/'))));
});
