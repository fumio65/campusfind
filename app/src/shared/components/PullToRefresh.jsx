import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { triggerSync } from '../lib/appLifecycle'

const THRESHOLD = 64 // px of pull before a release triggers a refresh
const MAX_PULL = 100 // px the indicator can be dragged down to, with resistance past this
const MIN_SPINNER_MS = 500 // keep the spinner visible long enough to read as "it did something"

// Wraps a scrollable container and adds a native-feeling pull-to-refresh
// gesture: pulling down while already scrolled to the top drags a spinner
// into view, and releasing past THRESHOLD calls triggerSync() - the same
// pub/sub every page's own refresh effect already listens to (resume,
// reconnect), so this needs no per-page wiring.
export default function PullToRefresh({ children }) {
  const containerRef = useRef(null)
  const startY = useRef(null)
  const pulling = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function handleTouchStart(e) {
    if (refreshing) return
    if (containerRef.current.scrollTop > 0) {
      pulling.current = false
      return
    }
    startY.current = e.touches[0].clientY
    pulling.current = true
  }

  function handleTouchMove(e) {
    if (!pulling.current || startY.current == null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) {
      setPullDistance(0)
      return
    }
    // Scrolled away from the top mid-gesture (e.g. content loaded) - bail.
    if (containerRef.current.scrollTop > 0) {
      pulling.current = false
      setPullDistance(0)
      return
    }
    // Resistance past MAX_PULL so it can't be dragged indefinitely.
    const resisted = delta < MAX_PULL ? delta : MAX_PULL + (delta - MAX_PULL) * 0.2
    setPullDistance(resisted)
  }

  async function handleTouchEnd() {
    if (!pulling.current) return
    pulling.current = false
    startY.current = null
    if (pullDistance >= THRESHOLD) {
      setRefreshing(true)
      setPullDistance(THRESHOLD)
      const start = Date.now()
      triggerSync() // fire-and-forget: each page's own effect refetches its data
      const elapsed = Date.now() - start
      if (elapsed < MIN_SPINNER_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS - elapsed))
      }
      setRefreshing(false)
    }
    setPullDistance(0)
  }

  const indicatorDistance = refreshing ? THRESHOLD : pullDistance
  const progress = Math.min(indicatorDistance / THRESHOLD, 1)

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto pb-20 no-scrollbar bg-surface-page relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute left-0 right-0 flex justify-center pointer-events-none z-10"
        style={{
          top: 10,
          height: 0,
          opacity: progress,
          transform: `translateY(${indicatorDistance}px)`,
          transition: pulling.current ? 'none' : 'transform 200ms ease, opacity 200ms ease',
        }}
      >
        <div className="w-8 h-8 rounded-full bg-surface-card shadow-md flex items-center justify-center">
          <RefreshCw
            size={16}
            className={`text-brand-600 ${refreshing ? 'animate-spin' : ''}`}
            style={refreshing ? undefined : { transform: `rotate(${progress * 360}deg)` }}
          />
        </div>
      </div>
      <div
        style={{
          transform: `translateY(${indicatorDistance}px)`,
          transition: pulling.current ? 'none' : 'transform 200ms ease',
        }}
      >
        {children}
      </div>
    </div>
  )
}
