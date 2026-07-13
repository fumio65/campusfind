import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'

export default function TrustScoreDialog({ delta, newScore, reason, visible, onDismiss }) {
  const isPositive = delta > 0
  const hasRepeatPenalty = delta <= -10

  return (
    <AnimatePresence>
      {visible && (
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
            className={`relative w-full max-w-xs rounded-2xl shadow-xl p-6 text-center ${
              isPositive
                ? 'bg-status-open-bg border border-status-open-text/20'
                : 'bg-status-rejected-bg border border-status-rejected-text/20'
            }`}
          >
            {/* Icon */}
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              isPositive ? 'bg-status-open-text/10' : 'bg-status-rejected-text/10'
            }`}>
              {isPositive
                ? <TrendingUp size={32} className="text-status-open-text" />
                : <TrendingDown size={32} className="text-status-rejected-text" />
              }
            </div>

            {/* Delta */}
            <p className={`text-4xl font-bold mb-1 ${
              isPositive ? 'text-status-open-text' : 'text-status-rejected-text'
            }`}>
              {isPositive ? `+${delta}` : delta}
            </p>

            {/* Label */}
            <p className={`text-sm font-semibold mb-2 ${
              isPositive ? 'text-status-open-text' : 'text-status-rejected-text'
            }`}>
              Trust Score {isPositive ? 'increased' : 'decreased'}
            </p>

            {/* Reason */}
            {reason && (
              <p className={`text-xs mb-2 ${
                isPositive ? 'text-status-open-text/80' : 'text-status-rejected-text/80'
              }`}>
                {reason}
              </p>
            )}

            {/* Repeat penalty explanation */}
            {hasRepeatPenalty && (
              <div className="bg-status-rejected-text/10 rounded-xl px-3 py-2 mb-3">
                <p className="text-[11px] text-status-rejected-text font-medium">
                  Includes an extra -5 penalty for 3 or more rejected claims within 30 days.
                </p>
              </div>
            )}

            {/* New score */}
            <p className={`text-xs mb-5 ${
              isPositive ? 'text-status-open-text/70' : 'text-status-rejected-text/70'
            }`}>
              Your trust score is now <span className="font-semibold">{newScore}</span> points
            </p>

            {/* Dismiss button */}
            <button
              onClick={onDismiss}
              className={`w-full h-10 rounded-xl text-sm font-semibold transition-colors ${
                isPositive
                  ? 'bg-status-open-text text-white hover:opacity-90'
                  : 'bg-status-rejected-text text-white hover:opacity-90'
              }`}
            >
              OK
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}