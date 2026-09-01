import { useEffect, useState } from 'react'
import { ensureCached, getCachedUrl } from '../lib/imageCache'

// Drop-in replacement for <img> with offline-first caching (keyed by
// `cacheKey`, typically the storage path or public URL), backed by the
// shared cache in lib/imageCache.js: already-resolved photos render on the
// very first paint with no async wait at all - the same cache is also
// warmed by refreshReports (prefetch) and report create/edit (seeding from
// the local file), so this component mostly just reads what's already
// there. A genuine cache miss falls back to a single network fetch (with
// retry) and caches the result for next time.
export default function CachedImage({ src, cacheKey, alt = '', className, onError, ...rest }) {
  const [displaySrc, setDisplaySrc] = useState(() => (cacheKey ? getCachedUrl(cacheKey) : (src ?? null)))

  useEffect(() => {
    if (!src || !cacheKey) {
      setDisplaySrc(src ?? null)
      return
    }

    const cached = getCachedUrl(cacheKey)
    if (cached) {
      setDisplaySrc(cached)
      return
    }

    let cancelled = false
    setDisplaySrc(null)
    ensureCached(src, cacheKey).then((url) => {
      if (!cancelled && url) setDisplaySrc(url)
    })

    return () => {
      cancelled = true
    }
  }, [src, cacheKey])

  function handleError(e) {
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
