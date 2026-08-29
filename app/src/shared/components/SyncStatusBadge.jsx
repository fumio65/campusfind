import { useLiveQuery } from 'dexie-react-hooks'
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { db } from '../lib/db'
import { useOnlineStatus } from '../lib/network'

const EMPTY_COUNTS = { pending: 0, failed: 0 }

export default function SyncStatusBadge() {
  const online = useOnlineStatus()
  const counts = useLiveQuery(async () => {
    const rows = await db.sync_queue.toArray()
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      failed: rows.filter((r) => r.status === 'failed').length,
    }
  }, []) ?? EMPTY_COUNTS

  if (online && counts.pending === 0 && counts.failed === 0) return null

  const tone = !online
    ? 'bg-status-claimed-bg text-status-claimed-text'
    : counts.failed > 0
      ? 'bg-status-rejected-bg text-status-rejected-text'
      : 'bg-brand-50 text-brand-700'

  return (
    <div className="fixed bottom-20 left-0 right-0 z-30 flex justify-center px-4 pointer-events-none">
      <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-sm ${tone}`}>
        {!online ? (
          <>
            <WifiOff size={12} />
            <span>
              Offline{counts.pending > 0 ? ` — ${counts.pending} change${counts.pending === 1 ? '' : 's'} will sync` : ''}
            </span>
          </>
        ) : counts.failed > 0 ? (
          <>
            <AlertTriangle size={12} />
            <span>{counts.failed} change{counts.failed === 1 ? '' : 's'} couldn't sync</span>
          </>
        ) : (
          <>
            <RefreshCw size={12} className="animate-spin" />
            <span>Syncing {counts.pending} change{counts.pending === 1 ? '' : 's'}…</span>
          </>
        )}
      </div>
    </div>
  )
}
