import { RefreshCw, AlertTriangle } from 'lucide-react'

// Small inline indicator for an item's `_syncStatus` (set on the cached row
// by the offline write pipeline - see shared/lib/syncEngine.js). Renders
// nothing once the item has synced.
export default function SyncStateChip({ status, className = '' }) {
  if (status === 'pending') {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full shrink-0 ${className}`}>
        <RefreshCw size={9} className="animate-spin" />
        Syncing
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium text-status-rejected-text bg-status-rejected-bg px-1.5 py-0.5 rounded-full shrink-0 ${className}`}>
        <AlertTriangle size={9} />
        Couldn't sync
      </span>
    )
  }
  return null
}
