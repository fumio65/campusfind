import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, X, MapPin, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, UserCheck
} from 'lucide-react'
import StatusPill from '../../shared/components/StatusPill'
import Dialog from '../../shared/components/Dialog'
import { supabase } from '../../shared/lib/supabaseClient'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const PAGE_SIZE = 50

const STATUS_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Claimed', value: 'claimed' },
  { label: 'Approved', value: 'approved' },
  { label: 'Resolved', value: 'resolved' },
]

const CATEGORIES = [
  'Electronics', 'IDs & Cards', 'Bags', 'Clothing',
  'Books & Notes', 'Keys', 'Wallet', 'Jewelry', 'Documents', 'Other',
]

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const EMPTY_HANDOFF = { verifiedStudentId: '', notes: '', isProxy: false, proxyStudentId: '' }

export default function ReportsPage() {
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [resolving, setResolving] = useState(null)
  const [confirmResolve, setConfirmResolve] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [handoffRecord, setHandoffRecord] = useState(EMPTY_HANDOFF)
  const [validatingId, setValidatingId] = useState(false)
  const [idValidation, setIdValidation] = useState(null)
  const [verifiedOwnerName, setVerifiedOwnerName] = useState(null)
  const [validatingProxyId, setValidatingProxyId] = useState(false)
  const [proxyIdValidation, setProxyIdValidation] = useState(null)
  const [verifiedProxyName, setVerifiedProxyName] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [confirmingOwner, setConfirmingOwner] = useState(false)
  const [ownerConfirmSent, setOwnerConfirmSent] = useState(false)
  const [ownerConfirmStatus, setOwnerConfirmStatus] = useState(null)
  const [editReport, setEditReport] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '', walkin_finder_ref: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [deletingReportId, setDeletingReportId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightId, setHighlightId] = useState(null)
  const pollRef = useRef(null)
  const debounceRef = useRef(null)
  const validateRef = useRef(null)
  const proxyValidateRef = useRef(null)
  const rowRefs = useRef({})

  useEffect(() => {
    const highlight = searchParams.get('highlight')
    if (highlight) {
      setHighlightId(highlight)
      searchParams.delete('highlight')
      setSearchParams(searchParams, { replace: true })
    }
  }, [])

  useEffect(() => {
    if (highlightId && rowRefs.current[highlightId]) {
      rowRefs.current[highlightId].scrollIntoView({ behavior: 'smooth', block: 'center' })
      const timer = setTimeout(() => setHighlightId(null), 2500)
      return () => clearTimeout(timer)
    }
  }, [highlightId, reports])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setOffset(0)
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('admin-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proxy_requests' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [offset, debouncedSearch, activeTab])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset, status: activeTab })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`${SERVER_URL}/reports?${params}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setReports(body.reports)
      setTotal(body.total)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleStudentIdChange(value) {
    setHandoffRecord((r) => ({ ...r, verifiedStudentId: value }))
    setIdValidation(null)
    setVerifiedOwnerName(null)
    clearTimeout(validateRef.current)
    if (!value.trim()) return
    validateRef.current = setTimeout(() => validateStudentId(value), 600)
  }

  async function validateStudentId(studentId) {
    setValidatingId(true)
    try {
      const inputId = studentId.trim().toUpperCase()

      if (confirmResolve?.isWalkIn) {
        const finderRef = confirmResolve?.walkinFinderRef?.toUpperCase()
        if (finderRef && inputId === finderRef) {
          setIdValidation('invalid')
          setVerifiedOwnerName(null)
          setValidatingId(false)
          return
        }
      }

      if (!confirmResolve?.isWalkIn && !handoffRecord.isProxy) {
        const reporterStudentId = confirmResolve?.reporterStudentId?.toUpperCase()
        if (reporterStudentId && inputId !== reporterStudentId) {
          setIdValidation('invalid'); setVerifiedOwnerName(null); setValidatingId(false); return
        }
      }

      const res = await fetch(`${SERVER_URL}/accounts?search=${encodeURIComponent(inputId)}&limit=5`)
      const body = await res.json()
      const exact = (body.accounts ?? []).find((a) => a.student_id === inputId)
      if (exact) { setIdValidation('valid'); setVerifiedOwnerName(`${exact.first_name} ${exact.last_name}`) }
      else { setIdValidation('invalid'); setVerifiedOwnerName(null) }
    } catch {
      setIdValidation(null); setVerifiedOwnerName(null)
    } finally {
      setValidatingId(false)
    }
  }

  function handleProxyStudentIdChange(value) {
    setHandoffRecord((r) => ({ ...r, proxyStudentId: value }))
    setProxyIdValidation(null)
    setVerifiedProxyName(null)
    clearTimeout(proxyValidateRef.current)
    if (!value.trim()) return
    proxyValidateRef.current = setTimeout(() => validateProxyStudentId(value), 600)
  }

  async function validateProxyStudentId(studentId) {
    setValidatingProxyId(true)
    try {
      const inputId = studentId.trim().toUpperCase()

      const finderRef = confirmResolve?.finderStudentId?.toUpperCase()
      if (finderRef && inputId === finderRef) {
        setProxyIdValidation('is_finder')
        setVerifiedProxyName(null)
        setValidatingProxyId(false)
        return
      }

      const reporterRef = confirmResolve?.reporterStudentId?.toUpperCase()
      if (reporterRef && inputId === reporterRef) {
        setProxyIdValidation('is_owner')
        setVerifiedProxyName(null)
        setValidatingProxyId(false)
        return
      }

      const res = await fetch(`${SERVER_URL}/accounts?search=${encodeURIComponent(inputId)}&limit=5`)
      const body = await res.json()
      const exact = (body.accounts ?? []).find((a) => a.student_id === inputId)
      if (exact) { setProxyIdValidation('valid'); setVerifiedProxyName(`${exact.first_name} ${exact.last_name}`) }
      else { setProxyIdValidation('invalid'); setVerifiedProxyName(null) }
    } catch {
      setProxyIdValidation(null); setVerifiedProxyName(null)
    } finally {
      setValidatingProxyId(false)
    }
  }

  function handleCloseConfirm() {
    setConfirmOpen(false)
    setShowFinalConfirm(false)
    setHandoffRecord(EMPTY_HANDOFF)
    setIdValidation(null)
    setVerifiedOwnerName(null)
    setProxyIdValidation(null)
    setVerifiedProxyName(null)
    setOwnerConfirmSent(false)
    setOwnerConfirmStatus(null)
    clearInterval(pollRef.current)
  }

  async function pollConfirmationStatus() {
    if (!confirmResolve?.id) return
    try {
      const res = await fetch(`${SERVER_URL}/confirmation/${confirmResolve.id}`)
      const data = await res.json()
      if (data?.status === 'approved' || data?.status === 'denied') {
        setOwnerConfirmStatus(data.status)
        clearInterval(pollRef.current)
      }
    } catch { /* ignore */ }
  }

  async function requestOwnerConfirmation() {
    if (!confirmResolve) return
    if (!handoffRecord.proxyStudentId.trim() || proxyIdValidation !== 'valid') return
    setConfirmingOwner(true)
    try {
      const report = reports.find((r) => r.id === confirmResolve.id)
      const res = await fetch(`${SERVER_URL}/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: confirmResolve.id,
          reporterId: report?.reporter?.id,
          proxyName: verifiedProxyName,
          proxyStudentId: handoffRecord.proxyStudentId.trim(),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setOwnerConfirmSent(true)
      pollRef.current = setInterval(pollConfirmationStatus, 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirmingOwner(false)
    }
  }

  async function handleForceResolve() {
    if (!confirmResolve) return
    const { id, via } = confirmResolve
    const finalProxyName = verifiedProxyName
    handleCloseConfirm()
    setResolving(id)
    try {
      const res = await fetch(`${SERVER_URL}/reports/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedVia: via,
          verifiedStudentId: handoffRecord.isProxy ? handoffRecord.proxyStudentId : handoffRecord.verifiedStudentId,
          notes: handoffRecord.notes,
          isProxy: handoffRecord.isProxy,
          proxyName: finalProxyName,
          proxyStudentId: handoffRecord.proxyStudentId,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setSuccessMsg(confirmResolve?.isWalkIn
        ? 'Owner identity verified and item released. Report marked as resolved.'
        : 'Report marked as resolved and handoff recorded.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setResolving(null)
    }
  }

  async function handleEditSave() {
    if (!editReport) return
    if (!editForm.title.trim()) return setError('Please enter the item name.')
    if (!editForm.description.trim()) return setError('Please describe the item.')
    if (!editForm.category) return setError('Please select a category.')
    if (!editForm.walkin_finder_ref.trim()) return setError("Please enter the finder's Student ID.")
    setEditSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('reports')
        .update({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          category: editForm.category,
          walkin_finder_ref: editForm.walkin_finder_ref.trim().toUpperCase(),
        })
        .eq('id', editReport.id)
      if (updateError) throw updateError
      setEditReport(null)
      setSuccessMsg('Report updated successfully.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDeleteReport() {
    if (!confirmDelete) return
    const reportId = confirmDelete.id
    setDeletingReportId(reportId)
    try {
      const { data: photos } = await supabase
        .from('report_photos')
        .select('storage_path')
        .eq('report_id', reportId)
      if (photos?.length) {
        await supabase.storage.from('report-photos').remove(photos.map((p) => p.storage_path))
      }

      await supabase.from('report_photos').delete().eq('report_id', reportId)
      await supabase.from('tips').delete().eq('report_id', reportId)

      const { error: deleteError } = await supabase.from('reports').delete().eq('id', reportId)
      if (deleteError) throw deleteError

      setConfirmDelete(null)
      setSuccessMsg('Report deleted successfully.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingReportId(null)
    }
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const dropOffPending = reports.filter((r) => r.status === 'approved' && r.active_claim?.drop_off_chosen)
  const proxyPending = reports.filter((r) => r.status === 'approved' && r.proxy_request && !r.active_claim?.drop_off_chosen)
  const isDropOff = confirmResolve?.via === 'issc_dropoff'
  const isWalkIn = confirmResolve?.isWalkIn === true
  const ownerAlreadyConfirmed = confirmResolve?.hasPreAuthorizedProxy || ownerConfirmStatus === 'approved'

  const canConfirmHandoff = isWalkIn
    ? handoffRecord.verifiedStudentId.trim() && idValidation === 'valid'
    : !isDropOff || ownerAlreadyConfirmed || (
      handoffRecord.isProxy
        ? handoffRecord.proxyStudentId.trim() && proxyIdValidation === 'valid'
        : handoffRecord.verifiedStudentId.trim() && idValidation === 'valid'
    )

  return (
    <div>
      <div className="sticky top-0 z-10 bg-surface-page pb-3 -mx-8 px-8 pt-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold text-text-primary">Reports</h2>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            placeholder="Search by title or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-9 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value); setOffset(0) }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-brand-600 text-white'
                  : 'text-text-secondary hover:bg-surface-muted border border-border-strong'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!error} onClose={() => setError(null)} tone="error" title="Error">
        {error}
      </Dialog>
      <Dialog open={!!successMsg} onClose={() => setSuccessMsg(null)} tone="success" title="Done">
        {successMsg}
      </Dialog>

      {/* Edit walk-in report dialog */}
      {editReport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <div className="bg-surface-card rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <p className="text-sm font-bold text-text-primary">Edit walk-in report</p>
                <p className="text-[11px] text-text-muted mt-0.5">{editReport.location}</p>
              </div>
              <button onClick={() => setEditReport(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-muted transition-colors">
                <X size={16} className="text-text-muted" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-text-secondary block mb-1">
                    Item name <span className="text-status-rejected-text">*</span>
                  </label>
                  <input
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary block mb-1">
                    Finder's Student ID <span className="text-status-rejected-text">*</span>
                  </label>
                  <input
                    value={editForm.walkin_finder_ref}
                    onChange={(e) => setEditForm((f) => ({ ...f, walkin_finder_ref: e.target.value }))}
                    placeholder="e.g. 24-00301"
                    className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Description <span className="text-status-rejected-text">*</span>
                </label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border-strong bg-surface-page resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1.5">
                  Category <span className="text-status-rejected-text">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, category: cat === f.category ? '' : cat }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        editForm.category === cat
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'border-border-strong text-text-secondary hover:border-brand-400 hover:text-brand-600'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
              <button
                onClick={() => setEditReport(null)}
                className="px-4 h-9 rounded-lg border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="px-5 h-9 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <div className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-status-rejected-bg flex items-center justify-center mb-3">
                <AlertCircle size={22} className="text-status-rejected-text" />
              </div>
              <h3 className="text-sm font-bold text-text-primary mb-1">Delete this report?</h3>
              <p className="text-xs text-text-secondary">
                "{confirmDelete.title}" will be permanently removed along with its photos and tips. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 h-10 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteReport}
                disabled={deletingReportId === confirmDelete.id}
                className="flex-1 h-10 rounded-xl bg-status-rejected-text text-white text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {deletingReportId === confirmDelete.id ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onClose={handleCloseConfirm}
        tone="info"
        title={isWalkIn ? 'Record owner collection' : isDropOff ? 'Record ISSC handoff' : 'Force resolve report?'}
        primaryAction={{
          label: isWalkIn ? 'Confirm collection' : isDropOff ? 'Confirm handoff' : 'Yes, resolve',
          onClick: () => setShowFinalConfirm(true),
          disabled: !canConfirmHandoff,
        }}
        secondaryAction={{ label: 'Cancel', onClick: handleCloseConfirm }}
      >
        {isWalkIn ? (
          <div className="flex flex-col gap-3 mt-1">
            <p className="text-xs text-text-secondary">
              The owner has come in person to collect this item. Enter their Student ID or COR number to verify their identity and mark this report as resolved.
            </p>
            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">
                Owner's Student ID or COR number <span className="text-status-rejected-text">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. 24-00301"
                  value={handoffRecord.verifiedStudentId}
                  onChange={(e) => handleStudentIdChange(e.target.value)}
                  className={`w-full h-9 px-3 text-sm rounded-md border bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                    idValidation === 'invalid' ? 'border-status-rejected-text'
                      : idValidation === 'valid' ? 'border-status-open-text'
                        : 'border-border-strong'
                  }`}
                />
                {validatingId && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">Checking…</span>}
              </div>
              {idValidation === 'invalid' && (
                <p className="text-[11px] text-status-rejected-text mt-1 flex items-center gap-1">
                  <AlertCircle size={11} />
                  {handoffRecord.verifiedStudentId.trim().toUpperCase() === confirmResolve?.walkinFinderRef?.toUpperCase()
                    ? "This is the finder's ID, not the owner's. The finder already received credit for this item."
                    : 'Student ID not found in the system.'}
                </p>
              )}
              {idValidation === 'valid' && verifiedOwnerName && (
                <p className="text-[11px] text-status-open-text mt-1 flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  <span className="font-semibold">{verifiedOwnerName}</span> — identity verified.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Notes <span className="text-text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Verified via COR, 3:00PM"
                value={handoffRecord.notes}
                onChange={(e) => setHandoffRecord((r) => ({ ...r, notes: e.target.value }))}
                className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>
        ) : isDropOff ? (
          <div className="flex flex-col gap-4 mt-1">

            {/* Who is picking up */}
            <div>
              <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">
                Who is picking up the item?
              </p>
              {confirmResolve?.hasPreAuthorizedProxy ? (
                <div className="flex items-center gap-2 text-xs text-status-open-text bg-status-open-bg rounded-lg px-3 py-2.5">
                  <CheckCircle2 size={12} className="shrink-0" />
                  A proxy was pre-authorized by the owner via the app.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHandoffRecord((r) => ({ ...r, isProxy: false, proxyStudentId: '' }))
                      setProxyIdValidation(null); setVerifiedProxyName(null)
                    }}
                    className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${
                      !handoffRecord.isProxy
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-border-strong text-text-secondary hover:border-brand-400'
                    }`}
                  >
                    The owner
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHandoffRecord((r) => ({ ...r, isProxy: true, verifiedStudentId: '' }))
                      setIdValidation(null); setVerifiedOwnerName(null)
                    }}
                    className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${
                      handoffRecord.isProxy
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-border-strong text-text-secondary hover:border-brand-400'
                    }`}
                  >
                    Someone else (proxy)
                  </button>
                </div>
              )}
            </div>

            {/* Verify identity */}
            {!ownerAlreadyConfirmed && !handoffRecord.isProxy && !confirmResolve?.hasPreAuthorizedProxy && (
              <div>
                <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">
                  Verify Student ID
                </p>
                <label className="text-xs font-medium text-text-secondary block mb-1">
                  Owner's Student ID <span className="text-status-rejected-text">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. 24-00301"
                    value={handoffRecord.verifiedStudentId}
                    onChange={(e) => handleStudentIdChange(e.target.value)}
                    className={`w-full h-9 px-3 text-sm rounded-md border bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                      idValidation === 'invalid' ? 'border-status-rejected-text'
                        : idValidation === 'valid' ? 'border-status-open-text'
                          : 'border-border-strong'
                    }`}
                  />
                  {validatingId && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">Checking…</span>}
                </div>
                {idValidation === 'invalid' && (
                  <p className="text-[11px] text-status-rejected-text mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> ID does not match the owner's record.
                  </p>
                )}
                {idValidation === 'valid' && (
                  <p className="text-[11px] text-status-open-text mt-1 flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    {verifiedOwnerName ? <><span className="font-semibold">{verifiedOwnerName}</span> — ID verified.</> : 'ID verified.'}
                  </p>
                )}
              </div>
            )}

            {confirmResolve?.hasPreAuthorizedProxy ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-surface-muted rounded-lg px-3 py-2">
                  <p className="text-[10px] text-text-muted mb-0.5">Proxy name</p>
                  <p className="text-xs font-medium text-text-primary">{handoffRecord.proxyName}</p>
                </div>
                <div className="bg-surface-muted rounded-lg px-3 py-2">
                  <p className="text-[10px] text-text-muted mb-0.5">Proxy Student ID</p>
                  <p className="text-xs font-medium text-text-primary">{handoffRecord.proxyStudentId}</p>
                </div>
              </div>
            ) : handoffRecord.isProxy && (
              <div>
                <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">
                  Verify Student ID
                </p>
                <label className="text-xs font-medium text-text-secondary block mb-1">
                  Proxy's Student ID <span className="text-status-rejected-text">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. 23-00456"
                    value={handoffRecord.proxyStudentId}
                    onChange={(e) => handleProxyStudentIdChange(e.target.value)}
                    className={`w-full h-9 px-3 text-sm rounded-md border bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                      proxyIdValidation === 'valid' ? 'border-status-open-text'
                        : proxyIdValidation ? 'border-status-rejected-text'
                          : 'border-border-strong'
                    }`}
                  />
                  {validatingProxyId && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">Checking…</span>}
                </div>
                {proxyIdValidation === 'is_finder' && (
                  <p className="text-[11px] text-status-rejected-text mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> This is the finder's own ID. The finder cannot pick up the item as a proxy.
                  </p>
                )}
                {proxyIdValidation === 'is_owner' && (
                  <p className="text-[11px] text-status-rejected-text mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> This is the owner's own ID. Select "The owner" above instead.
                  </p>
                )}
                {proxyIdValidation === 'invalid' && (
                  <p className="text-[11px] text-status-rejected-text mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> Student ID not found in the system.
                  </p>
                )}
                {proxyIdValidation === 'valid' && (
                  <p className="text-[11px] text-status-open-text mt-1 flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    <span className="font-semibold">{verifiedProxyName}</span> — identity verified.
                  </p>
                )}

                <div className="pt-3">
                  {ownerConfirmStatus === 'approved' && (
                    <div className="flex items-start gap-2 text-xs text-status-open-text bg-status-open-bg rounded-lg px-3 py-2.5">
                      <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                      <div><p className="font-semibold mb-0.5">Owner approved.</p><p>You may release the item now.</p></div>
                    </div>
                  )}
                  {ownerConfirmStatus === 'denied' && (
                    <div className="flex items-start gap-2 text-xs text-status-rejected-text bg-status-rejected-bg rounded-lg px-3 py-2.5">
                      <AlertCircle size={13} className="shrink-0 mt-0.5" />
                      <div><p className="font-semibold mb-0.5">Owner denied.</p><p>Do not release the item to this person.</p></div>
                    </div>
                  )}
                  {!ownerConfirmStatus && (ownerConfirmSent ? (
                    <div className="flex items-center gap-2 text-xs text-status-claimed-text bg-status-claimed-bg rounded-lg px-3 py-2">
                      <div className="w-3 h-3 rounded-full border-2 border-status-claimed-text border-t-transparent animate-spin shrink-0" />
                      Waiting for owner response…
                    </div>
                  ) : (
                    <button type="button" onClick={requestOwnerConfirmation}
                      disabled={confirmingOwner || proxyIdValidation !== 'valid'}
                      className="w-full h-9 rounded-lg border border-brand-600 text-brand-600 text-xs font-semibold hover:bg-brand-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {confirmingOwner ? 'Sending…' : 'Request owner confirmation'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ownerAlreadyConfirmed && (
              <div className="flex items-start gap-2 text-xs text-status-open-text bg-status-open-bg rounded-xl px-3 py-2.5">
                <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Identity confirmed.</p>
                  <p>The owner has authorized this pickup. ID verification is not required.</p>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Notes <span className="text-text-muted font-normal">(optional)</span></label>
              <input type="text" placeholder="e.g. Handed over at front desk, 2:30PM" value={handoffRecord.notes}
                onChange={(e) => setHandoffRecord((r) => ({ ...r, notes: e.target.value }))}
                className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>
        ) : (
          'This will force-resolve the report. Use only when the reporter is unresponsive past the reminder cadence (FR-5).'
        )}
      </Dialog>

      {/* Final confirmation warning */}
      {showFinalConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center px-6">
          <div className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-status-claimed-bg flex items-center justify-center mb-3">
                <AlertCircle size={22} className="text-status-claimed-text" />
              </div>
              <h3 className="text-sm font-bold text-text-primary mb-1">
                {isWalkIn ? 'Release item to owner?' : isDropOff ? 'Confirm item handoff?' : 'Force resolve this report?'}
              </h3>
              <p className="text-xs text-text-secondary">
                {isWalkIn ? (
                  <>You verified <span className="font-semibold text-text-primary">{verifiedOwnerName}</span> ({handoffRecord.verifiedStudentId.toUpperCase()}) as the owner. This will mark the item as collected and cannot be undone.</>
                ) : isDropOff ? (
                  handoffRecord.isProxy || confirmResolve?.hasPreAuthorizedProxy ? (
                    <>You're releasing this item to a <span className="font-semibold text-text-primary">proxy</span>{verifiedProxyName ? <> — <span className="font-semibold text-text-primary">{verifiedProxyName}</span></> : ''}. This cannot be undone.</>
                  ) : (
                    <>You verified <span className="font-semibold text-text-primary">{verifiedOwnerName}</span> ({handoffRecord.verifiedStudentId.toUpperCase()}) as the owner. This will mark the item as handed over and cannot be undone.</>
                  )
                ) : (
                  'This will force-resolve the report without owner confirmation. This cannot be undone.'
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFinalConfirm(false)}
                className="flex-1 h-10 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Go back
              </button>
              <button
                onClick={() => { setShowFinalConfirm(false); handleForceResolve() }}
                className="flex-1 h-10 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
              >
                Yes, confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proxy pickup pending banner */}
      {proxyPending.length > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck size={15} className="text-brand-600 shrink-0" />
            <p className="text-sm font-semibold text-brand-600">
              {proxyPending.length} proxy pickup{proxyPending.length > 1 ? 's' : ''} registered
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {proxyPending.map((r) => (
              <div key={r.id} className="bg-surface-card rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 border border-border">
                <div>
                  <p className="text-sm font-medium text-text-primary">{r.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Owner: <span className="font-medium text-text-secondary">{r.reporter_name}</span>
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <UserCheck size={11} className="text-brand-600 shrink-0" />
                    <p className="text-xs text-brand-600 font-medium">
                      Proxy: {r.proxy_request.proxy_name} ({r.proxy_request.proxy_student_id})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setConfirmResolve({ id: r.id, via: 'issc_dropoff', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: true, finderStudentId: r.active_claim?.claimant_student_id })
                    setHandoffRecord((prev) => ({ ...prev, isProxy: true, proxyName: r.proxy_request.proxy_name, proxyStudentId: r.proxy_request.proxy_student_id }))
                    setConfirmOpen(true)
                  }}
                  disabled={resolving === r.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <CheckCircle2 size={13} />
                  Mark handed over
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-brand-600/70 mt-2.5">
            Verify the proxy's student ID and the owner's authorization before releasing the item.
          </p>
        </div>
      )}

      {/* Drop-off alert banner */}
      {dropOffPending.length > 0 && (
        <div className="bg-status-claimed-bg border border-status-claimed-text/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={15} className="text-status-claimed-text shrink-0" />
            <p className="text-sm font-semibold text-status-claimed-text">
              {dropOffPending.length} ISSC drop-off{dropOffPending.length > 1 ? 's' : ''} pending
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {dropOffPending.map((r) => (
              <div key={r.id} className="bg-surface-card rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{r.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Finder: <span className="font-medium text-text-secondary">{r.active_claim?.claimant_name}</span>
                    {r.active_claim?.claimant_student_id && ` (${r.active_claim.claimant_student_id})`}
                    {' · '}
                    Owner: <span className="font-medium text-text-secondary">{r.reporter_name}</span>
                  </p>
                  {r.proxy_request && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <UserCheck size={11} className="text-brand-600 shrink-0" />
                      <p className="text-xs text-brand-600 font-medium">
                        Proxy: {r.proxy_request.proxy_name} ({r.proxy_request.proxy_student_id})
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setConfirmResolve({ id: r.id, via: 'issc_dropoff', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: !!r.proxy_request, finderStudentId: r.active_claim?.claimant_student_id })
                    if (r.proxy_request) setHandoffRecord((prev) => ({ ...prev, isProxy: true, proxyName: r.proxy_request.proxy_name, proxyStudentId: r.proxy_request.proxy_student_id }))
                    setConfirmOpen(true)
                  }}
                  disabled={resolving === r.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <CheckCircle2 size={13} />
                  Mark handed over
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-text-muted py-8 text-center">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="bg-surface-card border border-border rounded-xl py-14 text-center">
          <p className="text-sm font-semibold text-text-primary mb-1">
            {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No reports yet'}
          </p>
          <p className="text-xs text-text-muted">Reports filed by students will appear here.</p>
        </div>
      ) : (
        <>
          <div className="bg-surface-card border border-border rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-[100px] z-10 bg-surface-muted border-b border-border">
                <tr className="text-left text-xs text-text-secondary font-semibold">
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Reporter</th>
                  <th className="py-2.5 px-3">Claimant</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Filed</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr
                    key={r.id}
                    ref={(el) => { rowRefs.current[r.id] = el }}
                    className={`border-b border-border last:border-0 transition-colors duration-500 ${
                      highlightId === r.id ? 'bg-brand-50' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        {r.active_claim?.drop_off_chosen && (
                          <MapPin size={12} className="text-status-claimed-text shrink-0" title="ISSC drop-off chosen" />
                        )}
                        {r.proxy_request && (
                          <UserCheck size={12} className="text-brand-600 shrink-0" title="Proxy pickup registered" />
                        )}
                        {r.title}
                      </div>
                      {r.proxy_request && (
                        <p className="text-[11px] text-brand-600 mt-0.5">
                          Proxy: {r.proxy_request.proxy_name} ({r.proxy_request.proxy_student_id})
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-3 text-text-secondary">
                      {r.type === 'found_walkin' ? 'Walk-in' : 'Lost'}
                    </td>
                    <td className="py-2 px-3 text-text-secondary">{r.location}</td>
                    <td className="py-2 px-3 text-text-secondary">{r.reporter_name}</td>
                    <td className="py-2 px-3 text-text-secondary">{r.active_claim?.claimant_name ?? '—'}</td>
                    <td className="py-2 px-3"><StatusPill status={r.status} /></td>
                    <td className="py-2 px-3 text-text-muted text-xs">{timeAgo(r.created_at)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.type === 'found_walkin' && r.status === 'open' && (
                          <button
                            onClick={() => { setEditReport(r); setEditForm({ title: r.title ?? '', description: r.description ?? '', category: r.category ?? '', walkin_finder_ref: r.walkin_finder_ref ?? '' }) }}
                            className="px-2.5 py-1 text-xs font-medium rounded-md border border-border-strong text-text-secondary hover:bg-surface-muted transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        {r.type === 'found_walkin' && r.status === 'open' && (
                          <button
                            onClick={() => setConfirmDelete(r)}
                            className="px-2.5 py-1 text-xs font-medium rounded-md border border-status-rejected-text/30 text-status-rejected-text hover:bg-status-rejected-bg transition-colors"
                          >
                            Delete
                          </button>
                        )}
                        {r.status === 'open' && r.type === 'found_walkin' && (
                          <button
                            onClick={() => { setConfirmResolve({ id: r.id, via: 'issc_walkin_pickup', reporterStudentId: null, hasPreAuthorizedProxy: false, isWalkIn: true, walkinFinderRef: r.walkin_finder_ref }); setConfirmOpen(true) }}
                            disabled={resolving === r.id}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-40 flex items-center gap-1"
                          >
                            <CheckCircle2 size={11} />
                            Owner collected
                          </button>
                        )}
                        {r.status === 'approved' && !r.active_claim?.drop_off_chosen && !r.proxy_request && (
                          <button
                            onClick={() => { setConfirmResolve({ id: r.id, via: 'issc_walkin_pickup', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: false }); setConfirmOpen(true) }}
                            disabled={resolving === r.id}
                            className="px-2.5 py-1 text-xs font-medium rounded-md border border-status-rejected-text/30 text-status-rejected-text hover:bg-status-rejected-bg transition-colors disabled:opacity-40"
                          >
                            Force resolve
                          </button>
                        )}
                        {r.status === 'approved' && r.active_claim?.drop_off_chosen && (
                          <button
                            onClick={() => {
                              setConfirmResolve({ id: r.id, via: 'issc_dropoff', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: !!r.proxy_request, finderStudentId: r.active_claim?.claimant_student_id })
                              if (r.proxy_request) setHandoffRecord((prev) => ({ ...prev, isProxy: true, proxyName: r.proxy_request.proxy_name, proxyStudentId: r.proxy_request.proxy_student_id }))
                              setConfirmOpen(true)
                            }}
                            disabled={resolving === r.id}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-40 flex items-center gap-1"
                          >
                            <CheckCircle2 size={11} />
                            Mark handed over
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-text-muted">
              {debouncedSearch
                ? `${total} result${total === 1 ? '' : 's'} for "${debouncedSearch}"`
                : `${total} report${total === 1 ? '' : 's'} total`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="p-1.5 rounded-md border border-border-strong hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs text-text-secondary px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="p-1.5 rounded-md border border-border-strong hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}