import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const TONE_CONFIG = {
  success: { icon: CheckCircle2, iconClass: 'bg-status-open-bg text-status-open-text' },
  error: { icon: AlertTriangle, iconClass: 'bg-status-rejected-bg text-status-rejected-text' },
  info: { icon: Info, iconClass: 'bg-status-claimed-bg text-status-claimed-text' },
}

export default function Dialog({ open, onClose, tone = 'info', title, children, primaryAction, secondaryAction }) {
  const { icon: Icon, iconClass } = TONE_CONFIG[tone]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="bg-surface-card rounded-xl shadow-xl w-full max-w-md p-6"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}>
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h3 id="dialog-title" className="text-sm font-semibold text-text-primary">
                  {title}
                </h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-text-muted hover:text-text-primary shrink-0"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="text-sm text-text-secondary leading-relaxed pl-12 -mt-1 mb-5">
              {children}
            </div>

            <div className="flex justify-end gap-2">
              {secondaryAction && (
                <button
                  onClick={secondaryAction.onClick ?? onClose}
                  className="px-4 py-2 text-sm font-medium rounded-md border border-border-strong hover:bg-surface-muted transition-colors"
                >
                  {secondaryAction.label}
                </button>
              )}
              {primaryAction ? (
                <button
                  onClick={primaryAction.onClick ?? onClose}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    primaryAction.destructive
                      ? 'bg-status-rejected-text text-white hover:opacity-90'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  {primaryAction.label}
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                >
                  Got it
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}