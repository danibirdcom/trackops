/* TrackOps service worker — app shell + tile runtime cache */

const SHELL_CACHE = 'trackops-shell-v1'
const ASSET_CACHE = 'trackops-assets-v1'
const TILE_CACHE = 'trackops-tiles-v1'
const TILE_CACHE_MAX = 2000

const TILE_HOST_PATTERNS = [
  /^https:\/\/([a-z]\.)?tile\.openstreetmap\.org\//,
  /^https:\/\/([a-z]\.)?tile\.opentopomap\.org\//,
  /^https:\/\/([a-z]\.)?basemaps\.cartocdn\.com\//,
]

const SHELL_URLS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => {/* shell will fill in via runtime cache */}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, ASSET_CACHE, TILE_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

function isTileRequest(url) {
  return TILE_HOST_PATTERNS.some((re) => re.test(url))
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= max) return
  const toDelete = keys.length - Math.floor(max * 0.9)
  for (let i = 0; i < toDelete; i++) await cache.delete(keys[i])
}

async function cacheFirstTile(request) {
  const cache = await caches.open(TILE_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request, { mode: 'cors', credentials: 'omit' })
    if (response.ok) {
      cache.put(request, response.clone()).then(() => trimCache(TILE_CACHE, TILE_CACHE_MAX))
    }
    return response
  } catch (err) {
    if (cached) return cached
    throw err
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached ?? fetchPromise
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put('/', response.clone())
    }
    return response
  } catch {
    const cache = await caches.open(SHELL_CACHE)
    const fallback = (await cache.match('/')) || (await cache.match('/index.html'))
    if (fallback) return fallback
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = request.url

  if (isTileRequest(url)) {
    event.respondWith(cacheFirstTile(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request))
    return
  }

  const reqUrl = new URL(url)
  if (reqUrl.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE))
  }
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (data.type === 'CLEAR_TILES') {
    event.waitUntil(caches.delete(TILE_CACHE))
  }
  if (data.type === 'TILE_CACHE_STATS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(TILE_CACHE)
        const keys = await cache.keys()
        const reply = { type: 'TILE_CACHE_STATS', count: keys.length }
        const port = event.ports && event.ports[0]
        if (port) port.postMessage(reply)
        else if (event.source) event.source.postMessage(reply)
      })(),
    )
  }
})
