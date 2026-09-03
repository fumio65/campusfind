import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

// Generic two-button confirmation modal - e.g. leaving a form with unsaved
// changes. `visible` controls the dialog independently of a message string,
// since a plain yes/no prompt doesn't need one to carry state.
export default function ConfirmDialog({
  visible,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Discard',
  cancelLabel = 'Keep editing',
  onConfirm,
  onCancel,
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xs rounded-2xl shadow-xl p-6 text-center bg-surface-card"
          >
            <div className="w-12 h-12 rounded-full bg-status-rejected-bg flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} className="text-status-rejected-text" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">{title}</p>
            {message && <p className="text-sm text-text-secondary mb-5">{message}</p>}
            <div className="flex flex-col gap-2 mt-1">
              <button
                onClick={onConfirm}
                className="w-full h-10 rounded-xl bg-status-rejected-text text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                {confirmLabel}
              </button>
              <button
                onClick={onCancel}
                className="w-full h-10 rounded-xl bg-surface-page text-text-secondary text-sm font-semibold hover:bg-surface-muted transition-colors"
              >
                {cancelLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
