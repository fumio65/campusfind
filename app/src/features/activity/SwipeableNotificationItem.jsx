import { useEffect, useRef } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { Trash2 } from 'lucide-react'

const DELETE_WIDTH = 76
const OPEN_X = -DELETE_WIDTH
const OPEN_THRESHOLD = -DELETE_WIDTH / 2
const SPRING = { type: 'spring', stiffness: 500, damping: 40 }

// A swipe-left-to-reveal-delete row, styled after the standard iOS Mail /
// Messages pattern: swiping doesn't delete anything by itself, it only
// reveals a Delete button underneath. Only one row is ever open at a time -
// isOpen/onOpenChange is owned by the parent list so opening a second row
// snaps the first one shut.
export default function SwipeableNotificationItem({ id, isOpen, onOpenChange, onRequestDelete, children }) {
  const x = useMotionValue(0)
  const wasOpenRef = useRef(isOpen)

  // Closed by the parent (another row opened, or this one's delete was
  // confirmed/cancelled) - snap back smoothly rather than jumping.
  useEffect(() => {
    if (!isOpen && wasOpenRef.current) {
      animate(x, 0, SPRING)
    }
    wasOpenRef.current = isOpen
  }, [isOpen, x])

  function handleDragEnd(_, info) {
    const current = x.get()
    const shouldOpen = current < OPEN_THRESHOLD || info.velocity.x < -400
    if (shouldOpen) {
      animate(x, OPEN_X, SPRING)
      onOpenChange(id)
    } else {
      animate(x, 0, SPRING)
      if (isOpen) onOpenChange(null)
    }
  }

  function closeSwipe() {
    animate(x, 0, SPRING)
    onOpenChange(null)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={SPRING}
      className="relative overflow-hidden border-b border-border last:border-0"
    >
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: DELETE_WIDTH }}
      >
        <button
          onClick={() => {
            closeSwipe()
            onRequestDelete()
          }}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-status-rejected-text text-white active:opacity-80 transition-opacity"
        >
          <Trash2 size={16} aria-hidden="true" />
          <span className="text-[10px] font-semibold">Delete</span>
        </button>
      </div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: OPEN_X, right: 0 }}
        dragElastic={{ left: 0.15, right: 0 }}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative bg-surface-card"
      >
        {children}

        {/* While open, a tap anywhere on the row just closes it instead of
            also firing whatever onClick/navigation the content underneath
            has - this transparent layer only exists while swiped open. */}
        {isOpen && (
          <div
            className="absolute inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation()
              closeSwipe()
            }}
          />
        )}
      </motion.div>
    </motion.div>
  )
}
