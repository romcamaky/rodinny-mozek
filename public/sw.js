const STATIC_CACHE = 'rodinny-mozek-static-v1'
const APP_SHELL_FILES = ['/', '/index.html', '/manifest.json']

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

// Intercept requests and choose strategy by request type.
self.addEventListener('fetch', (event) => {
  const request = event.request

  // Use network-first for API requests so data stays fresh, with cache fallback offline.
  if (request.url.includes('/rest/v1/') || request.url.includes('/auth/v1/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clonedResponse = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clonedResponse))
          return response
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request)
          return cachedResponse || new Response('Offline', { status: 503 })
        }),
    )
    return
  }

  // Use cache-first for static assets, then network as fallback.
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        return fetch(request).then((response) => {
          const clonedResponse = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clonedResponse))
          return response
        })
      }),
    )
    return
  }

  // For navigation/document requests, prefer network and fall back to cached shell.
  event.respondWith(
    fetch(request).catch(async () => {
      const cachedResponse = await caches.match('/index.html')
      return cachedResponse || caches.match('/')
    }),
  )
})
