import { useEffect, useState } from 'react'
import { fetchBulkImportBatch } from './api'
import DataRow from './DataRow'

// Read-only replay of a past batch's review table, reusing the same DataRow
// used during an active import - canEdit is false here since a confirmed,
// discarded, or otherwise past batch can no longer be edited or confirmed.
export default function BatchDetailDialog({ batchId, filename, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    fetchBulkImportBatch(batchId)
      .then((data) => {
        if (!cancelled) setRows(data.rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [batchId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-surface-card rounded-xl shadow-xl w-full max-w-4xl p-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary truncate">{filename ?? 'Import batch'}</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {rows ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : 'Loading…'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-primary shrink-0 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {error && <p className="text-sm text-status-rejected-text">{error}</p>}

          {!error && rows === null && (
            <div className="py-10 text-center text-sm text-text-muted">Loading rows…</div>
          )}

          {!error && rows?.length === 0 && (
            <div className="py-10 text-center text-sm text-text-muted">This batch has no rows.</div>
          )}

          {!error && rows?.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-secondary">
                  <th className="py-2 px-3 font-semibold">Student ID</th>
                  <th className="py-2 px-3 font-semibold">Enrollment #</th>
                  <th className="py-2 px-3 font-semibold">Name</th>
                  <th className="py-2 px-3 font-semibold">CSV status</th>
                  <th className="py-2 px-3 font-semibold">Action</th>
                  <th className="py-2 px-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <DataRow key={row.id} row={row} canEdit={false} isEditing={false} onStartEdit={() => {}} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
