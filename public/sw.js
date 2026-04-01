const STATIC_CACHE = 'rodinny-mozek-static-v1'
const APP_SHELL_FILES = ['/', '/index.html']

// During install, cache the core app shell so first paint works offline.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES)),
  )
  self.skipWaiting()
})

// During activation, remove outdated caches and take control immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Intercept fetch requests and choose caching strategy.
self.addEventListener('fetch', (event) => {
  const request = event.request

  // NEVER intercept Supabase API calls — let them go straight to the network.
  // This includes REST API (/rest/v1/), Auth (/auth/v1/), Edge Functions (/functions/v1/),
  // and realtime WebSocket connections.
  if (request.url.includes('supabase.co')) {
    return // Don't call event.respondWith — browser handles normally
  }

  // NEVER cache non-GET requests (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') {
    return
  }

  // Cache-first for static assets (scripts, styles, images, fonts)
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const clone = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
      }),
    )
    return
  }

  // Network-first for navigation (HTML pages) with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    )
    return
  }
})
