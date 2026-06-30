// Battery Work storage-v2
// Δεν κρατάμε offline cache, για να μη φορτώνει παλιά έκδοση στο iPhone.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});

self.addEventListener('fetch', () => {
  // Άστο στο browser. Δεν κάνουμε cache.
});
