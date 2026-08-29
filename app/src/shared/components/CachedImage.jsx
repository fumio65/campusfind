import { useEffect, useState } from 'react'
import { db } from '../lib/db'

// Drop-in replacement for <img>: opportunistically caches the image bytes
// after a successful load (keyed by `cacheKey`, typically the storage path),
// and falls back to the cached copy if the network request fails - e.g. the
// same thumbnail viewed again while offline.
export default function CachedImage({ src, cacheKey, alt = '', className, onError, ...rest }) {
  const [displaySrc, setDisplaySrc] = useState(src)

  useEffect(() => {
    setDisplaySrc(src)
  }, [src])

  useEffect(() => {
    if (!src || !cacheKey) return
    let cancelled = false
    fetch(src)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('image fetch failed'))))
      .then((blob) => {
        if (!cancelled) db.image_cache.put({ id: cacheKey, data: blob, cachedAt: Date.now() }).catch(() => {})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [src, cacheKey])

  async function handleError(e) {
    if (cacheKey) {
      const cached = await db.image_cache.get(cacheKey).catch(() => null)
      if (cached) {
        setDisplaySrc(URL.createObjectURL(cached.data))
        return
      }
    }
    onError?.(e)
  }

  return <img src={displaySrc} alt={alt} className={className} onError={handleError} {...rest} />
}
