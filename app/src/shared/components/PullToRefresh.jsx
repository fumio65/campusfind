import { useEffect, useRef, useState } from 'react'
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
// FIX: the page header (sticky inside this same scroll container) kept
// visibly moving during the pull even after the content's own transform was
// removed. The real cause: this container's native touch-scroll "rubber
// band" bounce was still playing out underneath - dragging everything in
// it, header included - because nothing told the WebView to suppress it.
// Two things were needed, and `overscroll-behavior` CSS alone isn't enough:
//   1. overscroll-behavior-y: contain, so the bounce doesn't happen at all.
//   2. touchmove's preventDefault() while actively pulling, so the browser
//      never starts its own scroll/bounce gesture in the first place. React
//      attaches onTouchMove as a *passive* listener (preventDefault is a
//      silent no-op there), so this has to be a real addEventListener with
//      { passive: false } instead of a JSX touch handler.
// With both in place, nothing in the DOM moves except the floating spinner.
export default function PullToRefresh({ children }) {
  const containerRef = useRef(null)
  const startY = useRef(null)
  const pulling = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function onTouchStart(e) {
      if (refreshing) return
      if (el.scrollTop > 0) {
        pulling.current = false
        return
      }
      startY.current = e.touches[0].clientY
      pulling.current = true
    }

    function onTouchMove(e) {
      if (!pulling.current || startY.current == null) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        setPullDistance(0)
        return
      }
      if (el.scrollTop > 0) {
        // Scrolled away from the top mid-gesture (e.g. content loaded) - bail.
        pulling.current = false
        setPullDistance(0)
        return
      }
      // Stop the browser's own scroll/bounce from ever starting, so only
      // our indicator moves - see the FIX note above.
      e.preventDefault()
      const resisted = delta < MAX_PULL ? delta : MAX_PULL + (delta - MAX_PULL) * 0.2
      setPullDistance(resisted)
    }

    async function onTouchEnd() {
      if (!pulling.current) return
      pulling.current = false
      startY.current = null
      setPullDistance((current) => {
        if (current >= THRESHOLD) doRefresh()
        return 0
      })
    }

    async function doRefresh() {
      setRefreshing(true)
      const start = Date.now()
      triggerSync() // fire-and-forget: each page's own effect refetches its data
      const elapsed = Date.now() - start
      if (elapsed < MIN_SPINNER_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS - elapsed))
      }
      setRefreshing(false)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [refreshing])

  const indicatorDistance = refreshing ? THRESHOLD : pullDistance
  const progress = Math.min(indicatorDistance / THRESHOLD, 1)
  // Settles just under the status bar / notch, not at a fixed pixel count,
  // so it lands in the same place on every device.
  const topOffset = 'max(env(safe-area-inset-top), 0.5rem)'

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overscroll-y-contain pb-20 no-scrollbar bg-surface-page"
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
