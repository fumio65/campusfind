import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/lib/AuthContext'
import { motion } from 'framer-motion'
import { UserPlus, UserMinus, Copy, AlertTriangle, CheckCircle2, ChevronDown, RefreshCw, Search, X } from 'lucide-react'
import { uploadBulkImportCsv, fetchBulkImportBatch, confirmBulkImport, cancelBulkImport, PENDING_BATCH_KEY, UPLOAD_IN_PROGRESS_KEY } from './api'
import MetricTile from './MetricTile'
import EditPanel from './EditPanel'
import DataRow from './DataRow'
import CsvDropzone from './CsvDropzone'
import TemplateCard from './TemplateCard'
import RecentImports from './RecentImports'
import ColumnMappingStep from './ColumnMappingStep'
import { parseCsvHeaderRow, headersAlreadyMatch } from './columnMapping'
import Dialog from '../../../shared/components/admin/Dialog'
import { staggerContainer } from '../../../shared/lib/adminMotion'
import { getAdminCache, setAdminCache } from '../../../shared/lib/adminCache'

const SUCCESS_RENDER_CAP = 50
const ERROR_RENDER_CAP = 100
const AUTO_EXPAND_THRESHOLD = 15

// What to show before init() has run: the cached preview of the batch still
// under review (if any), so returning to this tab doesn't show the
// "Checking for an in-progress import..." screen again.
function initialPreview() {
  try {
    const id = sessionStorage.getItem(PENDING_BATCH_KEY)
    return id ? getAdminCache(`bulk-import:${id}`) ?? null : null
  } catch {
    return null
  }
}

function needsInitialCheck() {
  try {
    return !!(sessionStorage.getItem(PENDING_BATCH_KEY) || sessionStorage.getItem(UPLOAD_IN_PROGRESS_KEY))
  } catch {
    return false
  }
}

export default function BulkImportPage() {
  const cachedPreview = useRef(initialPreview()).current
  const [filename, setFilename] = useState(cachedPreview?.batch?.filename ?? null)
  const [rows, setRows] = useState(cachedPreview?.rows ?? [])
  const [batch, setBatch] = useState(cachedPreview?.batch ?? null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)
  const [confirmResult, setConfirmResult] = useState(null)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [editingRowId, setEditingRowId] = useState(null)
  const [successExpanded, setSuccessExpanded] = useState(true)
  // Only show the "checking" screen when there's something to check and no
  // cached preview to show meanwhile.
  const [loadingBatch, setLoadingBatch] = useState(() => !cachedPreview && needsInitialCheck())
  const [resumingUpload, setResumingUpload] = useState(false)
  const [justFixedRowId, setJustFixedRowId] = useState(null)
  const [mappingHeaders, setMappingHeaders] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [rowSearch, setRowSearch] = useState('')
  const uploadAbortRef = useRef(null)
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const hasBatch = !!batch
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.action]: (acc[row.action] ?? 0) + 1 }), {})
  // Nothing to commit when every row already matches the current accounts.
  const hasChanges = (counts.create ?? 0) + (counts.update ?? 0) + (counts.deactivate ?? 0) > 0
  const hasError = rows.some((row) => row.action === 'error')

  // Checking on one person shouldn't require scrolling a few hundred rows -
  // matches student ID (either direction, since it's a short code) and
  // name in both "First Last" and "Last, First" order, so the search box
  // behaves the same way regardless of which part of the name is typed.
  const searchQuery = rowSearch.trim().toLowerCase()
  const matchesSearch = (row) => {
    if (!searchQuery) return true
    if ((row.student_id ?? '').toLowerCase().includes(searchQuery)) return true
    const firstLast = `${row.first_name ?? ''} ${row.last_name ?? ''}`.toLowerCase()
    const lastFirst = `${row.last_name ?? ''} ${row.first_name ?? ''}`.toLowerCase()
    return firstLast.includes(searchQuery) || lastFirst.includes(searchQuery)
  }

  const errorRows = rows.filter((row) => row.action === 'error' && matchesSearch(row))
  const successRows = rows.filter((row) => row.action !== 'error' && matchesSearch(row))
  const noSearchMatches = searchQuery && errorRows.length === 0 && successRows.length === 0 && rows.length > 0

  // Keep the in-progress preview (including row edits) cached for revisits.
  useEffect(() => {
    if (batch?.id && batch.status === 'pending_review') {
      setAdminCache(`bulk-import:${batch.id}`, { batch, rows })
    }
  }, [batch, rows])

  useEffect(() => {
    let cancelled = false

    async function loadPendingBatch(batchId) {
      try {
        const { batch: loadedBatch, rows: loadedRows } = await fetchBulkImportBatch(batchId)
        if (cancelled) return
        if (loadedBatch.status !== 'pending_review') {
          sessionStorage.removeItem(PENDING_BATCH_KEY)
          // It was confirmed/cancelled elsewhere: drop the cached preview.
          setBatch(null)
          setRows([])
          setFilename(null)
          return
        }
        setBatch(loadedBatch)
        setRows(loadedRows)
        setFilename(loadedBatch.filename)
        const successCount = loadedRows.filter((r) => r.action !== 'error').length
        setSuccessExpanded(successCount <= AUTO_EXPAND_THRESHOLD)
      } catch {
        sessionStorage.removeItem(PENDING_BATCH_KEY)
        if (!cancelled) {
          setBatch(null)
          setRows([])
          setFilename(null)
        }
      }
    }

    async function init() {
      const savedBatchId = sessionStorage.getItem(PENDING_BATCH_KEY)
      if (savedBatchId) {
        await loadPendingBatch(savedBatchId)
        if (!cancelled) setLoadingBatch(false)
        return
      }

      const isUploadInProgress = sessionStorage.getItem(UPLOAD_IN_PROGRESS_KEY)
      if (!isUploadInProgress) {
        if (!cancelled) setLoadingBatch(false)
        return
      }

      if (!cancelled) {
        setLoadingBatch(false)
        setResumingUpload(true)
      }
      const POLL_INTERVAL_MS = 1000
      const MAX_ATTEMPTS = 20
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        if (cancelled) return
        const nowSavedBatchId = sessionStorage.getItem(PENDING_BATCH_KEY)
        if (nowSavedBatchId) {
          await loadPendingBatch(nowSavedBatchId)
          break
        }
        if (!sessionStorage.getItem(UPLOAD_IN_PROGRESS_KEY)) {
          break
        }
      }
      if (!cancelled) setResumingUpload(false)
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  // Hand-off from the "Bulk import" quick-start dialog on the Accounts page:
  // it only captures the file, then routes here with it in router state so
  // the actual mapping/review/confirm work happens on this full page. Only
  // auto-starts once there's nothing already in progress, and clears the
  // state immediately after so a refresh or back-navigation doesn't re-fire it.
  useEffect(() => {
    if (loadingBatch || resumingUpload || hasBatch || mappingHeaders) return
    const autoFile = location.state?.autoFile
    if (!autoFile) return
    navigate(location.pathname, { replace: true, state: {} })
    handleFileSelected(autoFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingBatch, resumingUpload, hasBatch, mappingHeaders, location.state])

  async function performUpload(file, mapping) {
    setUploading(true)
    setError(null)
    setConfirmResult(null)
    const controller = new AbortController()
    uploadAbortRef.current = controller
    try {
      const result = await uploadBulkImportCsv(file, session?.user?.id, mapping, {
        signal: controller.signal,
      })
      setBatch(result.batch)
      setRows(result.rows)
      setFilename(file.name)
      const successCount = result.rows.filter((r) => r.action !== 'error').length
      setSuccessExpanded(successCount <= AUTO_EXPAND_THRESHOLD)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message)
      }
    } finally {
      setUploading(false)
      uploadAbortRef.current = null
    }
  }

  // Peeks at the CSV's header row before uploading. Files that already use
  // the Registrar template's exact column names skip straight to the same
  // upload as before; anything else goes through the mapping step first.
  async function handleFileSelected(file) {
    setError(null)
    let headers
    try {
      headers = parseCsvHeaderRow(await file.text())
    } catch {
      setError('Could not read the selected file.')
      return
    }
    if (headers.length === 0) {
      setError('CSV appears to be empty.')
      return
    }
    if (headersAlreadyMatch(headers)) {
      performUpload(file, null)
    } else {
      setPendingFile(file)
      setMappingHeaders(headers)
    }
  }

  function handleMappingConfirm(mapping) {
    const file = pendingFile
    setMappingHeaders(null)
    setPendingFile(null)
    performUpload(file, mapping)
  }

  function handleMappingCancel() {
    setMappingHeaders(null)
    setPendingFile(null)
  }

  function handleCancelUpload() {
    uploadAbortRef.current?.abort()
  }

  function handleRowSaved(updatedRow) {
    setRows((prev) => prev.map((r) => (r.id === updatedRow.id ? updatedRow : r)))
    if (updatedRow.action !== 'error') {
      setSuccessExpanded(true)
      setJustFixedRowId(updatedRow.id)
      setTimeout(() => setJustFixedRowId(null), 2500)
    }
  }

  async function handleConfirm() {
    if (!batch) return
    setConfirming(true)
    setError(null)
    try {
      const result = await confirmBulkImport(batch.id)
      setConfirmResult(result)
      setIsConfirmed(true)
      sessionStorage.removeItem(PENDING_BATCH_KEY)
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirming(false)
    }
  }

  async function handleCancel() {
    sessionStorage.removeItem(PENDING_BATCH_KEY)
    // After a successful confirm this button just clears the screen - the
    // import is already committed and must not be marked as discarded.
    if (batch && !isConfirmed) {
      try {
        await cancelBulkImport(batch.id)
      } catch (err) {
        console.warn('Cancel failed:', err.message)
      }
    }
    setBatch(null)
    setRows([])
    setFilename(null)
    setConfirmResult(null)
    setIsConfirmed(false)
    setEditingRowId(null)
    setMappingHeaders(null)
    setPendingFile(null)
    setRowSearch('')
  }

  if (loadingBatch) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-text-primary">Bulk import preview</h2>
        </div>
        <div className="text-sm text-text-muted py-8 text-center">Checking for an in-progress import...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-text-primary">Bulk import preview</h2>
      </div>

      <TemplateCard />

      <CsvDropzone
        onFileSelected={handleFileSelected}
        onCancelUpload={handleCancelUpload}
        uploading={uploading}
        filename={filename}
        rowCount={rows.length}
      />

      <Dialog open={!!error} onClose={() => setError(null)} tone="error" title="Something went wrong">
        {error}
      </Dialog>

      <Dialog
        open={!!confirmResult}
        onClose={() => setConfirmResult(null)}
        tone="success"
        title="Import confirmed"
        maxWidth="max-w-md"
      >
        {confirmResult && (
          <>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2.5">
                <div className="text-2xl font-bold text-status-open-text leading-none">{confirmResult.created}</div>
                <div className="text-xs text-text-secondary mt-1">Created</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2.5">
                <div className="text-2xl font-bold text-status-open-text leading-none">{confirmResult.updated}</div>
                <div className="text-xs text-text-secondary mt-1">Updated</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2.5">
                <div className="text-2xl font-bold text-status-claimed-text leading-none">{confirmResult.deactivated}</div>
                <div className="text-xs text-text-secondary mt-1">Deactivated</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2.5">
                <div className="text-2xl font-bold text-text-secondary leading-none">{confirmResult.skipped}</div>
                <div className="text-xs text-text-secondary mt-1">Skipped (duplicate)</div>
              </div>
            </div>
            <p className="text-xs text-text-muted">These changes are already live in Accounts.</p>
          </>
        )}
      </Dialog>

      {mappingHeaders ? (
        <ColumnMappingStep
          headers={mappingHeaders}
          filename={pendingFile?.name}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      ) : !hasBatch ? (
        resumingUpload ? (
          <div className="bg-surface-card border border-border rounded-xl py-14 text-center">
            <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-text-primary mb-1">Finishing your upload...</p>
            <p className="text-xs text-text-muted max-w-xs mx-auto">
              An import was still processing when you navigated away. It should appear here shortly.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-surface-card border border-border rounded-xl py-14 text-center">
              <p className="text-sm font-semibold text-text-primary mb-1">No import in progress</p>
              <p className="text-xs text-text-muted max-w-xs mx-auto">
                Upload a Registrar CSV above to see a real, editable preview before anything is created.
              </p>
            </div>
            <RecentImports />
          </>
        )
      ) : (
        <>
          <motion.div className="grid grid-cols-5 gap-4 mb-4" {...staggerContainer} initial={cachedPreview ? false : staggerContainer.initial}>
            <MetricTile label="New accounts" value={counts.create ?? 0} tone="open" icon={UserPlus} dimmed={hasError} />
            <MetricTile label="Updates" value={counts.update ?? 0} tone="open" icon={RefreshCw} dimmed={hasError} />
            <MetricTile label="Deactivations" value={counts.deactivate ?? 0} tone="claimed" icon={UserMinus} dimmed={hasError} />
            <MetricTile label="Duplicates" value={counts.skip_duplicate ?? 0} tone="muted" icon={Copy} dimmed={hasError} />
            <MetricTile label="Errors" value={counts.error ?? 0} tone="rejected" icon={AlertTriangle} />
          </motion.div>

          {hasError && (
            <p className="text-xs text-text-muted -mt-2 mb-4">
              Nothing will be created, deactivated, or skipped until every error below is resolved. Imports are all-or-nothing.
            </p>
          )}

          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by name or student ID to check one person…"
              value={rowSearch}
              onChange={(e) => setRowSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-9 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {rowSearch && (
              <button
                onClick={() => setRowSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {noSearchMatches && (
            <div className="bg-surface-card border border-border rounded-xl py-10 text-center mb-4">
              <p className="text-sm font-medium text-text-primary mb-1">No rows match "{rowSearch}"</p>
              <p className="text-xs text-text-muted">Try the student ID or part of the name.</p>
            </div>
          )}

          {!noSearchMatches && (
          <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
            {errorRows.length > 0 && (
              <div className="border-b border-status-rejected-text/15">
                <div className="px-3 py-2 bg-status-rejected-bg/50 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-status-rejected-text" aria-hidden="true" />
                  <span className="text-xs font-semibold text-status-rejected-text">
                    Needs attention ({errorRows.length})
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-secondary font-semibold bg-surface-muted">
                      <th className="py-2.5 px-3">Student ID</th>
                      <th className="py-2.5 px-3">Enrollment no.</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">CSV status</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.slice(0, ERROR_RENDER_CAP).map((row) =>
                      editingRowId === row.id ? (
                        <EditPanel
                          key={row.id}
                          row={row}
                          batchId={batch?.id}
                          onSaved={handleRowSaved}
                          onClose={() => setEditingRowId(null)}
                        />
                      ) : (
                        <DataRow
                          key={row.id}
                          row={row}
                          canEdit
                          isEditing={false}
                          onStartEdit={() => setEditingRowId(row.id)}
                        />
                      )
                    )}
                  </tbody>
                </table>
                {errorRows.length > ERROR_RENDER_CAP && (
                  <p className="text-xs text-status-rejected-text px-3 py-2 bg-status-rejected-bg/30 border-t border-status-rejected-text/15">
                    Showing first {ERROR_RENDER_CAP} of {errorRows.length} errors. With this many, it's usually faster to fix the issue in the source file and re-upload than to edit rows individually.
                  </p>
                )}
              </div>
            )}

            {successRows.length > 0 && (
              <div>
                <button
                  onClick={() => setSuccessExpanded((v) => !v)}
                  className="w-full px-3 py-2 bg-surface-muted flex items-center justify-between gap-2 hover:bg-border/40 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-status-open-text" aria-hidden="true" />
                    <span className="text-xs font-semibold text-text-secondary">
                      Ready to import ({successRows.length})
                    </span>
                  </span>
                  <span className="text-xs text-text-muted flex items-center gap-1">
                    {successExpanded ? 'Hide' : 'Show'}
                    <ChevronDown
                      size={13}
                      className={`transition-transform ${successExpanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {successExpanded && (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-text-secondary font-semibold bg-surface-muted border-t border-border">
                          <th className="py-2.5 px-3">Student ID</th>
                          <th className="py-2.5 px-3">Enrollment no.</th>
                          <th className="py-2.5 px-3">Name</th>
                          <th className="py-2.5 px-3">CSV status</th>
                          <th className="py-2.5 px-3">Action</th>
                          <th className="py-2.5 px-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {successRows.slice(0, SUCCESS_RENDER_CAP).map((row) => (
                          <DataRow
                            key={row.id}
                            row={row}
                            canEdit
                            isEditing={false}
                            onStartEdit={() => {}}
                            justFixed={row.id === justFixedRowId}
                          />
                        ))}
                      </tbody>
                    </table>
                    {successRows.length > SUCCESS_RENDER_CAP && (
                      <p className="text-xs text-text-muted px-3 py-2 border-t border-border">
                        Showing first {SUCCESS_RENDER_CAP} of {successRows.length} rows. All {successRows.length} will be included when you confirm.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          )}

          <div className="sticky bottom-0 -mx-8 px-8 py-3 mt-4 bg-surface-page/95 backdrop-blur-sm border-t border-border flex items-center justify-between gap-3">
            <p className="text-xs text-text-muted">
              {isConfirmed
                ? 'Import confirmed. These changes are already live in Accounts.'
                : hasError
                ? 'One or more rows have an error. Click "Fix" to correct inline, or re-upload the source file. Imports are all-or-nothing.'
                : !hasChanges
                ? 'Nothing to import: every row already matches the current accounts. Cancel to discard this preview.'
                : `${rows.length} rows ready. Imports are all-or-nothing.`}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border-strong bg-surface-card hover:bg-surface-muted transition-colors"
              >
                {isConfirmed ? 'Start a new import' : 'Cancel import'}
              </button>
              <button
                onClick={handleConfirm}
                disabled={hasError || !hasChanges || confirming || isConfirmed}
                className="px-4 py-2 text-sm font-medium rounded-md bg-brand-600 text-white disabled:bg-surface-muted disabled:text-text-muted disabled:cursor-not-allowed transition-colors"
              >
                {confirming ? 'Confirming...' : 'Confirm import'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}