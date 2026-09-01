import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'

// A freshly-created (or edited) report's photo row is written to the local
// cache with its final storage path before the upload actually completes
// (see createReport/updateReport) - so the network image 404s for a window
// after submit. Retry with the same capped backoff shape as the sync queue
// instead of leaving the thumbnail broken until the screen is revisited.
const MAX_RETRIES = 5
const retryDelay = (n) => Math.min(1000 * 2 ** n, 30_000)

// Drop-in replacement for <img> with offline-first caching (keyed by
// `cacheKey`, typically the storage path or public URL): if a copy is
// already cached, it's shown immediately with no network request at all -
// report photos are immutable once uploaded (each edit/create writes a new
// storage path rather than overwriting one), so a cache hit never needs
// revalidating. Only a cache miss touches the network (a single fetch, not
// also a competing direct <img> load - see below), and the result is cached
// for next time. Falls back to the cached copy if the network request
// fails, e.g. offline.
export default function CachedImage({ src, cacheKey, alt = '', className, onError, ...rest }) {
  // Starts blank rather than pointed at `src`: if we started the <img> on
  // the network URL immediately, every mount - including cache hits - would
  // fire a real network request before the (async) cache lookup below had a
  // chance to override it, doubling up with the fetch() request below on a
  // cache miss and needlessly competing for connections on a hit.
  const [displaySrc, setDisplaySrc] = useState(null)
  const objectUrlRef = useRef(null)

  function setDisplayBlob(blob) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(blob)
    objectUrlRef.current = url
    setDisplaySrc(url)
  }

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!src || !cacheKey) {
      setDisplaySrc(src ?? null)
      return
    }

    let cancelled = false
    let retryTimer = null
    setDisplaySrc(null)

    function attemptFetch(retryCount) {
      fetch(src, retryCount > 0 ? { cache: 'no-store' } : undefined)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('image fetch failed'))))
        .then((blob) => {
          if (cancelled) return
          db.image_cache.put({ id: cacheKey, data: blob, cachedAt: Date.now() }).catch(() => {})
          setDisplayBlob(blob)
        })
        .catch(() => {
          if (cancelled || retryCount >= MAX_RETRIES) return
          retryTimer = setTimeout(() => attemptFetch(retryCount + 1), retryDelay(retryCount))
        })
    }

    db.image_cache
      .get(cacheKey)
      .then((cached) => {
        if (cancelled) return
        if (cached) {
          setDisplayBlob(cached.data)
          return
        }
        attemptFetch(0)
      })
      .catch(() => {
        if (!cancelled) attemptFetch(0)
      })

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [src, cacheKey])

  async function handleError(e) {
    if (cacheKey) {
      const cached = await db.image_cache.get(cacheKey).catch(() => null)
      if (cached) {
        setDisplayBlob(cached.data)
        return
      }
    }
    onError?.(e)
  }

  // Reserves the same footprint the real <img> would take (className
  // typically carries the sizing/shape classes) so the layout doesn't jump
  // once the image is ready.
  if (!displaySrc) {
    return <div className={`${className ?? ''} bg-surface-muted animate-pulse`} aria-hidden="true" />
  }

  return <img src={displaySrc} alt={alt} className={className} onError={handleError} {...rest} />
}
