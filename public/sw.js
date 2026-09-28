// Keep the service-worker endpoint valid for browsers or extensions that probe it.
// OneVision does not currently use offline caching or background sync.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
