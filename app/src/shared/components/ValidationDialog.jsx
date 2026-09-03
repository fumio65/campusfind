import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle } from 'lucide-react'

// Centered modal for form validation/submit errors - an inline banner at the
// top of a long scrollable form can sit off-screen by the time the user has
// scrolled down to the submit button, so they never see why it failed.
export default function ValidationDialog({ message, onDismiss }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6"
          onClick={onDismiss}
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
              <AlertCircle size={24} className="text-status-rejected-text" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">Almost there</p>
            <p className="text-sm text-text-secondary mb-5">{message}</p>
            <button
              onClick={onDismiss}
              className="w-full h-10 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
