import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { fetchBulkImportBatch } from './api'
import DataRow from './DataRow'
import { SkeletonLine, SkeletonTable } from '../../../shared/components/admin/Skeleton'

// Read-only replay of a past batch's review table, reusing the same DataRow
// used during an active import - canEdit is false here since a confirmed,
// discarded, or otherwise past batch can no longer be edited or confirmed.
export default function BatchDetailDialog({ batchId, filename, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  // Matches student ID (either direction) and name in both "First Last" and
  // "Last, First" order - mirrors the search box on the active review table
  // in BulkImportPage.jsx, so checking one person works the same way here.
  const query = search.trim().toLowerCase()
  const matchesSearch = (row) => {
    if (!query) return true
    if ((row.student_id ?? '').toLowerCase().includes(query)) return true
    const firstLast = `${row.first_name ?? ''} ${row.last_name ?? ''}`.toLowerCase()
    const lastFirst = `${row.last_name ?? ''} ${row.first_name ?? ''}`.toLowerCase()
    return firstLast.includes(query) || lastFirst.includes(query)
  }
  const visibleRows = (rows ?? []).filter(matchesSearch)
  const noSearchMatches = query && rows?.length > 0 && visibleRows.length === 0

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    setSearch('')
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

  // Rendered into a portal at document.body rather than in place - this page
  // animates its content with a framer-motion transform (see pageTransition
  // in adminMotion.js), and a transform on any ancestor turns `fixed` into
  // "fixed relative to that ancestor" instead of the viewport, which is what
  // was centering this dialog over just the <main> content area instead of
  // the whole screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-surface-card rounded-xl shadow-xl w-full max-w-4xl p-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary truncate">{filename ?? 'Import batch'}</h3>
            {rows ? (
              <p className="text-xs text-text-muted mt-0.5">
                {query
                  ? `${visibleRows.length} of ${rows.length} row${rows.length === 1 ? '' : 's'}`
                  : `${rows.length} row${rows.length === 1 ? '' : 's'}`}
              </p>
            ) : (
              <SkeletonLine className="w-16 mt-1.5 h-2.5" />
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-primary shrink-0 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        {rows?.length > 0 && (
          <div className="relative mb-4 shrink-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by name or student ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        )}

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {error && <p className="text-sm text-status-rejected-text">{error}</p>}

          {!error && rows === null && (
            <div className="py-2">
              <SkeletonTable columns={4} rows={5} />
            </div>
          )}

          {!error && rows?.length === 0 && (
            <div className="py-10 text-center text-sm text-text-muted">This batch has no rows.</div>
          )}

          {!error && noSearchMatches && (
            <div className="py-10 text-center text-sm text-text-muted">No rows match "{search}".</div>
          )}

          {!error && visibleRows.length > 0 && (
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
                {visibleRows.map((row) => (
                  <DataRow key={row.id} row={row} canEdit={false} isEditing={false} onStartEdit={() => {}} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
