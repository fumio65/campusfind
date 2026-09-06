import { motion } from 'framer-motion'
import { staggerItem } from '../../../shared/lib/adminMotion'

export default function MetricTile({ label, value, tone, icon: Icon, dimmed = false }) {
  const styles = {
    open: { text: 'text-status-open-text', badge: 'bg-status-open-bg text-status-open-text' },
    claimed: { text: 'text-status-claimed-text', badge: 'bg-status-claimed-bg text-status-claimed-text' },
    muted: { text: 'text-text-secondary', badge: 'bg-surface-muted text-text-secondary' },
    rejected: { text: 'text-status-rejected-text', badge: 'bg-status-rejected-bg text-status-rejected-text' },
  }[tone]

  return (
    <motion.div
      className={`bg-surface-card border border-border rounded-xl p-5 flex items-center justify-between transition-opacity ${
        dimmed ? 'opacity-50' : ''
      }`}
      {...staggerItem}
    >
      <div>
        <div className="text-xs text-text-secondary mb-1">{label}</div>
        <div className={`text-3xl font-bold ${styles.text}`}>{value}</div>
      </div>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${styles.badge}`}>
        <Icon size={17} aria-hidden="true" />
      </div>
    </motion.div>
  )
}