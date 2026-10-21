import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { triggerSync } from '../lib/appLifecycle'

const THRESHOLD = 64 // px of pull before a release triggers a refresh
const MAX_PULL = 100 // px the indicator can be dragged down to, with resistance past this
const MIN_SPINNER_MS = 500 // keep the spinner visible long enough to read as "it did something"

// Wraps a scrollable container and adds a native-feeling pull-to-refresh
// gesture: pulling down while already scrolled to the top brings a floating
// spinner into view, and releasing past THRESHOLD calls triggerSync() - the
// same pub/sub every page's own refresh effect already listens to (resume,
// reconnect), so this needs no per-page wiring.
//
// FIX: this used to translateY the whole content block (indicator + page),
// which dragged each page's own sticky header down with it mid-pull -
// looked broken, not like a pull gesture. The content now never moves; only
// a small floating spinner, fixed to the viewport above everything
// (including the header), grows in and spins - the same pattern apps like
// Twitter/Threads use instead of pushing their nav bar around.
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
  // Settles just under the status bar / notch, not at a fixed pixel count,
  // so it lands in the same place on every device.
  const topOffset = 'max(env(safe-area-inset-top), 0.5rem)'

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto pb-20 no-scrollbar bg-surface-page"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="fixed left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{
          top: topOffset,
          opacity: progress,
          transform: `translateY(${(progress - 1) * 24}px) scale(${0.6 + progress * 0.4})`,
          transition: pulling.current ? 'none' : 'transform 200ms ease, opacity 200ms ease',
        }}
      >
        <div className="w-9 h-9 rounded-full bg-surface-card shadow-lg flex items-center justify-center">
          <RefreshCw
            size={17}
            className={`text-brand-600 ${refreshing ? 'animate-spin' : ''}`}
            style={refreshing ? undefined : { transform: `rotate(${progress * 360}deg)` }}
          />
        </div>
      </div>
      {children}
    </div>
  )
}
