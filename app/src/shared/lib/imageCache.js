import { db } from './db'

// A freshly-created (or edited) report's photo row is written to the local
// cache with its final storage path before the upload actually completes
// (see operations/reports.js) - so the network image 404s for a window
// after submit. Retry with the same capped backoff shape as the sync queue
// instead of leaving the thumbnail broken until the screen is revisited.
const MAX_RETRIES = 5
const retryDelay = (n) => Math.min(1000 * 2 ** n, 30_000)

// Object-URL cache shared by every image consumer (CachedImage, prefetching,
// optimistic seeding) for the app session, keyed by cacheKey. IndexedDB is
// durable but every read is still an async round-trip; report photos are
// immutable once uploaded, so a resolved URL is safe to reuse indefinitely -
// intentionally never revoked, since another consumer may still be using it.
const memoryCache = new Map()

// Fetches in flight, keyed by cacheKey, so a prefetch racing a CachedImage
// mount (or two CachedImage instances) for the same photo share one fetch
// instead of issuing duplicates.
const inFlight = new Map()

export function getCachedUrl(cacheKey) {
  return memoryCache.get(cacheKey) ?? null
}

function fetchWithRetry(src, cacheKey, retryCount) {
  return fetch(src, retryCount > 0 ? { cache: 'no-store' } : undefined)
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('image fetch failed'))))
    .then((blob) => {
      db.image_cache.put({ id: cacheKey, data: blob, cachedAt: Date.now() }).catch(() => {})
      const url = URL.createObjectURL(blob)
      memoryCache.set(cacheKey, url)
      return url
    })
    .catch((err) => {
      if (retryCount >= MAX_RETRIES) throw err
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          fetchWithRetry(src, cacheKey, retryCount + 1).then(resolve, reject)
        }, retryDelay(retryCount))
      })
    })
}

// Resolves once the image is in the in-memory cache, checking IndexedDB
// before falling back to a single network fetch (with retry). Safe to call
// speculatively for prefetching, or from a consumer that needs the URL -
// concurrent callers for the same cacheKey share one underlying fetch.
export function ensureCached(src, cacheKey) {
  if (!src || !cacheKey) return Promise.resolve(null)
  if (memoryCache.has(cacheKey)) return Promise.resolve(memoryCache.get(cacheKey))
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)

  const promise = db.image_cache
    .get(cacheKey)
    .then((cached) => {
      if (cached) {
        const url = URL.createObjectURL(cached.data)
        memoryCache.set(cacheKey, url)
        return url
      }
      return fetchWithRetry(src, cacheKey, 0)
    })
    .catch(() => fetchWithRetry(src, cacheKey, 0))
    .finally(() => inFlight.delete(cacheKey))

  inFlight.set(cacheKey, promise)
  return promise
}

// Seeds the cache directly from a locally-authored file, before it's ever
// uploaded - used when creating/editing a report, so its thumbnail is
// available instantly from the user's own photo instead of waiting on the
// upload to finish and a network fetch to complete.
export function seedCache(cacheKey, file) {
  if (!cacheKey || !file || memoryCache.has(cacheKey)) return
  db.image_cache.put({ id: cacheKey, data: file, cachedAt: Date.now() }).catch(() => {})
  memoryCache.set(cacheKey, URL.createObjectURL(file))
}
