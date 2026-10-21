import { useEffect, useState } from 'react'
import { UserPlus, RefreshCw, UserMinus, Copy, AlertTriangle } from 'lucide-react'
import { fetchRecentBulkImportBatches } from './api'
import { getAdminCache, setAdminCache } from '../../../shared/lib/adminCache'
import BatchDetailDialog from './BatchDetailDialog'

const STATUS_STYLES = {
  confirmed: 'bg-status-open-bg text-status-open-text',
  pending_review: 'bg-status-claimed-bg text-status-claimed-text',
  discarded: 'bg-surface-muted text-text-secondary',
}

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  pending_review: 'Pending review',
  discarded: 'Discarded',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// A simple read-only audit trail for the Bulk Import feature - until this
// existed, a confirmed import left no trace anywhere in the admin UI, so
// there was no way to answer "who ran the last import, and what did it do?"
export default function RecentImports() {
  // Start from the last list so it doesn't pop in (and push the page down)
  // every time the tab is opened; the fetch below refreshes it.
  const [batches, setBatches] = useState(() => getAdminCache('bulk-import:recent') ?? null)
  const [error, setError] = useState(null)
  const [selectedBatch, setSelectedBatch] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchRecentBulkImportBatches()
      .then((data) => {
        if (cancelled) return
        setBatches(data.batches)
        setAdminCache('bulk-import:recent', data.batches)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return null // non-essential history view - fail quietly rather than block the upload flow
  if (batches === null) return null
  if (batches.length === 0) return null

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-text-primary mb-2">Recent imports</h3>
      <div className="bg-surface-card border border-border rounded-xl divide-y divide-border">
        {batches.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setSelectedBatch(b)}
            className="w-full text-left px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-muted/60 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">{b.filename ?? 'Untitled import'}</div>
              <div className="text-xs text-text-muted mt-0.5">
                {formatDate(b.confirmed_at ?? b.created_at)}
                {b.uploaded_by_name ? ` · ${b.uploaded_by_name}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2.5 text-xs text-text-secondary">
                <span className="flex items-center gap-1" title="Created">
                  <UserPlus size={13} aria-hidden="true" /> {b.counts.create}
                </span>
                <span className="flex items-center gap-1" title="Updated">
                  <RefreshCw size={13} aria-hidden="true" /> {b.counts.update}
                </span>
                <span className="flex items-center gap-1" title="Deactivated">
                  <UserMinus size={13} aria-hidden="true" /> {b.counts.deactivate}
                </span>
                <span className="flex items-center gap-1" title="Skipped (duplicate)">
                  <Copy size={13} aria-hidden="true" /> {b.counts.skip_duplicate}
                </span>
                {b.counts.error > 0 && (
                  <span className="flex items-center gap-1 text-status-rejected-text" title="Errors">
                    <AlertTriangle size={13} aria-hidden="true" /> {b.counts.error}
                  </span>
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[b.status] ?? STATUS_STYLES.discarded}`}>
                {STATUS_LABELS[b.status] ?? b.status}
              </span>
            </div>
          </button>
        ))}
      </div>

      {selectedBatch && (
        <BatchDetailDialog
          batchId={selectedBatch.id}
          filename={selectedBatch.filename}
          onClose={() => setSelectedBatch(null)}
        />
      )}
    </div>
  )
}
