const STATIC_CACHE = 'rodinny-mozek-static-v2'

/**
 * App shell: HTML + manifest + icons. Hashed JS/CSS from Vite are cached on first
 * successful fetch via the script/style handlers (not listed here — filenames change each build).
 */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/favicon.svg',
]

function isSupabaseOrAnthropicApi(url) {
  try {
    const u = new URL(url)
    return u.hostname.endsWith('supabase.co') || u.hostname.endsWith('anthropic.com')
  } catch {
    return false
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => {
        console.warn('[SW] precache partial failure', err)
        return caches.open(STATIC_CACHE).then((cache) =>
          Promise.all(
            PRECACHE_URLS.map((url) =>
              cache.add(url).catch(() => {
                /* ignore individual failures */
              }),
            ),
          ),
        )
      }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Never intercept Supabase or Anthropic — no caching, browser handles (network / CORS).
  if (isSupabaseOrAnthropicApi(request.url)) {
    return
  }

  if (request.method !== 'GET') {
    return
  }

  // Cache-first for static assets (Vite bundles, images, fonts)
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached
        }
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response
          }
          const clone = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
      }),
    )
    return
  }

  // Network-first for navigations; offline → cached app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match('/index.html').then((c) => c || caches.match('/'))),
    )
    return
  }

  // Everything else: default browser behavior (no caching)
})
