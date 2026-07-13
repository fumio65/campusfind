import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../shared/lib/AuthContext'
import { motion } from 'framer-motion'
import { UserPlus, UserMinus, Copy, AlertTriangle, CheckCircle2, ChevronDown, RefreshCw } from 'lucide-react'
import { uploadBulkImportCsv, fetchBulkImportBatch, confirmBulkImport, cancelBulkImport, PENDING_BATCH_KEY, UPLOAD_IN_PROGRESS_KEY } from './api'
import MetricTile from './MetricTile'
import EditPanel from './EditPanel'
import DataRow from './DataRow'
import CsvDropzone from './CsvDropzone'
import TemplateCard from './TemplateCard'
import Dialog from '../../shared/components/Dialog'
import { staggerContainer } from '../../shared/lib/motion'

const SUCCESS_RENDER_CAP = 50
const ERROR_RENDER_CAP = 100
const AUTO_EXPAND_THRESHOLD = 15

export default function BulkImportPage() {
  const [filename, setFilename] = useState(null)
  const [rows, setRows] = useState([])
  const [batch, setBatch] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)
  const [confirmResult, setConfirmResult] = useState(null)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [editingRowId, setEditingRowId] = useState(null)
  const [successExpanded, setSuccessExpanded] = useState(true)
  const [loadingBatch, setLoadingBatch] = useState(true)
  const [resumingUpload, setResumingUpload] = useState(false)
  const [justFixedRowId, setJustFixedRowId] = useState(null)
  const uploadAbortRef = useRef(null)
  const { session } = useAuth()

  const hasBatch = !!batch
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.action]: (acc[row.action] ?? 0) + 1 }), {})
  const hasError = rows.some((row) => row.action === 'error')
  const errorRows = rows.filter((row) => row.action === 'error')
  const successRows = rows.filter((row) => row.action !== 'error')

  useEffect(() => {
    let cancelled = false

    async function loadPendingBatch(batchId) {
      try {
        const { batch: loadedBatch, rows: loadedRows } = await fetchBulkImportBatch(batchId)
        if (cancelled) return
        if (loadedBatch.status !== 'pending_review') {
          sessionStorage.removeItem(PENDING_BATCH_KEY)
          return
        }
        setBatch(loadedBatch)
        setRows(loadedRows)
        setFilename(loadedBatch.filename)
        const successCount = loadedRows.filter((r) => r.action !== 'error').length
        setSuccessExpanded(successCount <= AUTO_EXPAND_THRESHOLD)
      } catch {
        sessionStorage.removeItem(PENDING_BATCH_KEY)
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

  async function handleFileSelected(file) {
    setUploading(true)
    setError(null)
    setConfirmResult(null)
    const controller = new AbortController()
    uploadAbortRef.current = controller
    try {
      const result = await uploadBulkImportCsv(file, session?.user?.id, {
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
    if (batch) {
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
      >
        {confirmResult && (
          <>
            <span className="font-medium text-text-primary">{confirmResult.created}</span> account
            {confirmResult.created === 1 ? '' : 's'} created,{' '}
            <span className="font-medium text-text-primary">{confirmResult.updated}</span> updated,{' '}
            <span className="font-medium text-text-primary">{confirmResult.deactivated}</span> deactivated, and{' '}
            <span className="font-medium text-text-primary">{confirmResult.skipped}</span> skipped as duplicates.
            These changes are already live in Accounts.
          </>
        )}
      </Dialog>

      {!hasBatch ? (
        resumingUpload ? (
          <div className="bg-surface-card border border-border rounded-xl py-14 text-center">
            <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-text-primary mb-1">Finishing your upload...</p>
            <p className="text-xs text-text-muted max-w-xs mx-auto">
              An import was still processing when you navigated away. It should appear here shortly.
            </p>
          </div>
        ) : (
          <div className="bg-surface-card border border-border rounded-xl py-14 text-center">
            <p className="text-sm font-semibold text-text-primary mb-1">No import in progress</p>
            <p className="text-xs text-text-muted max-w-xs mx-auto">
              Upload a Registrar CSV above to see a real, editable preview before anything is created.
            </p>
          </div>
        )
      ) : (
        <>
          <motion.div className="grid grid-cols-5 gap-4 mb-4" {...staggerContainer}>
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

          <div className="sticky bottom-0 -mx-8 px-8 py-3 mt-4 bg-surface-page/95 backdrop-blur-sm border-t border-border flex items-center justify-between gap-3">
            <p className="text-xs text-text-muted">
              {hasError
                ? 'One or more rows have an error. Click "Fix" to correct inline, or re-upload the source file. Imports are all-or-nothing.'
                : `${rows.length} rows ready. Imports are all-or-nothing.`}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border-strong bg-surface-card hover:bg-surface-muted transition-colors"
              >
                Cancel import
              </button>
              <button
                onClick={handleConfirm}
                disabled={hasError || confirming || isConfirmed}
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