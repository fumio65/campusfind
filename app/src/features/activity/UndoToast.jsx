import { motion } from 'framer-motion'
import { Undo2 } from 'lucide-react'

export const UNDO_WINDOW_MS = 5000

// A single "X deleted - Undo" toast with a shrinking progress bar timed to
// the undo window, so there's a clear visual countdown before the delete
// actually commits. Stacks in ActivityPage via AnimatePresence + layout.
export default function UndoToast({ message, onUndo }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      className="relative overflow-hidden bg-text-primary text-white rounded-xl shadow-lg px-4 py-3 flex items-center justify-between gap-3 pointer-events-auto"
    >
      <p className="text-xs font-medium">{message}</p>
      <button
        onClick={onUndo}
        className="flex items-center gap-1 text-xs font-semibold text-brand-200 hover:text-white transition-colors shrink-0"
      >
        <Undo2 size={13} aria-hidden="true" />
        Undo
      </button>
      <motion.div
        className="absolute bottom-0 left-0 h-0.5 bg-white/40 origin-left"
        style={{ width: '100%' }}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: UNDO_WINDOW_MS / 1000, ease: 'linear' }}
      />
    </motion.div>
  )
}
