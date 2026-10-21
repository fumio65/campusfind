import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { WifiOff, RefreshCw, AlertTriangle, X } from 'lucide-react'
import { db } from '../lib/db'
import { useOnlineStatus } from '../lib/network'
import { retryFailed, discardFailed } from '../lib/syncEngine'
import { DROPOFF_CHOSEN_BODY, DROPOFF_REQUESTED_BODY, DROPOFF_DECLINED_BODY } from '../lib/operations/messages'

const EMPTY = { pending: 0, failed: [] }

// What a queued change was, in words a student understands.
function describe(row) {
  const body = row.payload?.body ?? row.payload?.message?.body
  switch (row.opType) {
    case 'createReport': return 'New lost item report'
    case 'updateReport': return 'Edit to a report'
    case 'submitClaim': return 'Claim'
    case 'submitTip': return 'Tip'
    case 'chooseDropoff': return 'Accepting the ISSC drop-off'
    case 'sendMessage':
      if (body === DROPOFF_REQUESTED_BODY) return 'ISSC drop-off suggestion'
      if (body === DROPOFF_DECLINED_BODY) return 'Declining the ISSC drop-off'
      if (body === DROPOFF_CHOSEN_BODY) return 'Accepting the ISSC drop-off'
      return body ? `Message: "${body.length > 40 ? `${body.slice(0, 40)}…` : body}"` : 'Message'
    case 'markNotificationRead':
    case 'markAllNotificationsRead': return 'Marking notifications as read'
    case 'deleteNotification': return 'Deleting a notification'
    default: return 'Change'
  }
}

// The database's own error text is technical; map the common ones.
function reason(row) {
  const e = row.lastError ?? ''
  if (/message cap|10-message/i.test(e)) return 'The chat had reached its message limit.'
  if (/row-level security|permission|not allowed/i.test(e)) return 'This action is no longer allowed (the report may have changed).'
  if (/foreign key|not present/i.test(e)) return 'The report or claim no longer exists.'
  return e ? 'The server rejected it.' : ''
}

export default function SyncStatusBadge() {
  const online = useOnlineStatus()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const state = useLiveQuery(async () => {
    const rows = await db.sync_queue.toArray()
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      failed: rows.filter((r) => r.status === 'failed'),
    }
  }, []) ?? EMPTY
  const failedCount = state.failed.length

  if (online && state.pending === 0 && failedCount === 0) return null

  const tone = !online
    ? 'bg-status-claimed-bg text-status-claimed-text'
    : failedCount > 0
      ? 'bg-status-rejected-bg text-status-rejected-text'
      : 'bg-brand-50 text-brand-700'

  async function run(action) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <>
      <div className="fixed bottom-20 left-0 right-0 z-30 flex justify-center px-4 pointer-events-none">
        {online && failedCount > 0 ? (
          // Tappable: opens the list of failed changes with Retry / Discard,
          // so a change that can never succeed doesn't sit here forever.
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-sm ${tone}`}
          >
            <AlertTriangle size={12} />
            <span>{failedCount} change{failedCount === 1 ? '' : 's'} couldn't sync · Tap to fix</span>
          </button>
        ) : (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-sm ${tone}`}>
            {!online ? (
              <>
                <WifiOff size={12} />
                <span>
                  Offline{state.pending > 0 ? ` — ${state.pending} change${state.pending === 1 ? '' : 's'} will sync` : ''}
                </span>
              </>
            ) : (
              <>
                <RefreshCw size={12} className="animate-spin" />
                <span>Syncing {state.pending} change{state.pending === 1 ? '' : 's'}…</span>
              </>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => !busy && setOpen(false)}>
          <div
            className="bg-surface-card w-full max-w-md rounded-t-2xl p-4 pb-6 safe-bottom"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Changes that couldn't sync"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-text-primary">Changes that couldn't sync</p>
              <button onClick={() => setOpen(false)} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-surface-muted flex items-center justify-center">
                <X size={16} className="text-text-secondary" />
              </button>
            </div>
            <p className="text-xs text-text-muted mb-3">
              These were saved on this phone but the server didn't accept them.
            </p>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-4">
              {state.failed.map((row) => (
                <div key={row.seq} className="bg-surface-muted rounded-xl px-3 py-2.5">
                  <p className="text-xs font-medium text-text-primary">{describe(row)}</p>
                  {reason(row) && <p className="text-[11px] text-text-muted mt-0.5">{reason(row)}</p>}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => run(discardFailed)}
                disabled={busy}
                className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary disabled:opacity-50"
              >
                Discard
              </button>
              <button
                onClick={() => run(retryFailed)}
                disabled={busy}
                className="flex-1 h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Try again'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
