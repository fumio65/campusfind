import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, X, ChevronLeft, ChevronRight, MapPin, CheckCircle2,
  AlertCircle, Pencil, Trash2, Eye, Tag, Calendar, User,
  Package, FileText, Share2,
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabaseClient'
import Dialog from '../../shared/components/Dialog'
import ShareCardDialog from './ShareCardDialog'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

const STATUS_TABS = [
  { label: 'All',      value: 'all'      },
  { label: 'Open',     value: 'open'     },
  { label: 'Claimed',  value: 'claimed'  },
  { label: 'Approved', value: 'approved' },
  { label: 'Resolved', value: 'resolved' },
]

const CATEGORIES = [
  'Electronics', 'Clothing', 'Accessories', 'Books', 'Documents',
  'Keys', 'Wallet / Purse', 'Bag / Backpack', 'ID / Cards', 'Other',
]

function StatusBadge({ status }) {
  const map = {
    open:     'bg-status-open-bg text-status-open-text',
    claimed:  'bg-status-claimed-bg text-status-claimed-text',
    approved: 'bg-status-approved-bg text-status-approved-text',
    resolved: 'bg-status-resolved-bg text-status-resolved-text',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[status] ?? 'bg-surface-muted text-text-muted'}`}>
      {status}
    </span>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-text-muted" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{label}</p>
        <p className="text-xs text-text-primary mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}

// ─── Report Detail Dialog ─────────────────────────────────────────────────────
function ReportDetailDialog({ report, onClose, onEdit, onDelete, onAnnounce, onResolve, resolving, deletingId }) {
  const [photos, setPhotos]               = useState([])
  const [claimPhotos, setClaimPhotos]     = useState([])
  const [lightbox, setLightbox]           = useState(null)
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const [shareOpen, setShareOpen]         = useState(false)

  useEffect(() => {
    if (!report) return
    setPhotos([])
    setClaimPhotos([])
    setLoadingPhotos(true)
    fetchPhotos()
  }, [report?.id])

  async function fetchPhotos() {
    try {
      const { data: rp } = await supabase
        .from('report_photos')
        .select('storage_path')
        .eq('report_id', report.id)

      const reportUrls = (rp ?? []).map((p) => {
        const { data } = supabase.storage.from('report-photos').getPublicUrl(p.storage_path)
        return data?.publicUrl
      }).filter(Boolean)
      setPhotos(reportUrls)

      if (report.active_claim?.id) {
        const { data: cp } = await supabase
          .from('claim_photos')
          .select('storage_path')
          .eq('claim_id', report.active_claim.id)

        const claimUrls = (cp ?? []).map((p) => {
          const { data } = supabase.storage.from('report-photos').getPublicUrl(p.storage_path)
          return data?.publicUrl
        }).filter(Boolean)
        setClaimPhotos(claimUrls)
      }
    } catch (err) {
      console.error('Failed to fetch photos:', err)
    } finally {
      setLoadingPhotos(false)
    }
  }

  if (!report) return null
  const isWalkIn = report.type === 'found_walkin'

  return (
    <>
      {/* Share card */}
      {shareOpen && (
        <ShareCardDialog report={report} photoUrl={photos[0] ?? null} onClose={() => setShareOpen(false)} />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X size={18} className="text-white" />
          </button>
          <img
            src={lightbox}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
        <div className="bg-surface-card rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isWalkIn ? 'bg-status-approved-bg' : 'bg-brand-50'}`}>
                <Package size={16} className={isWalkIn ? 'text-status-approved-text' : 'text-brand-600'} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-text-primary">{report.title}</h2>
                  <StatusBadge status={report.status} />
                  {isWalkIn && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-status-approved-bg text-status-approved-text">
                      Walk-in
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Filed {new Date(report.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-muted transition-colors shrink-0">
              <X size={16} className="text-text-muted" />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5">

            {/* Photos */}
            <div>
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">Item Photos</p>
              {loadingPhotos ? (
                <div className="flex gap-2">
                  {[1,2,3].map((i) => <div key={i} className="w-24 h-24 rounded-xl bg-surface-muted animate-pulse" />)}
                </div>
              ) : photos.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {photos.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setLightbox(url)}
                      className="w-24 h-24 rounded-xl overflow-hidden border border-border hover:opacity-90 transition-opacity shrink-0"
                    >
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="w-full h-20 rounded-xl bg-surface-muted border border-border flex items-center justify-center">
                  <p className="text-xs text-text-muted">No photos attached</p>
                </div>
              )}
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={Tag} label="Category" value={report.category ?? '—'} />
              <InfoRow icon={MapPin} label="Location" value={report.location ?? '—'} />
              <InfoRow icon={User} label="Reporter" value={report.reporter_name ?? '—'} />
              {report.walkin_finder_ref && <InfoRow icon={User} label="Finder Student ID" value={report.walkin_finder_ref} />}
              {report.resolved_via && <InfoRow icon={CheckCircle2} label="Resolved via" value={report.resolved_via.replace(/_/g, ' ')} />}
              {report.resolved_at && (
                <InfoRow icon={Calendar} label="Resolved at" value={
                  new Date(report.resolved_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                } />
              )}
            </div>

            {/* Description */}
            <div>
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Description</p>
              <p className="text-sm text-text-primary leading-relaxed bg-surface-muted rounded-xl px-4 py-3">
                {report.description ?? '—'}
              </p>
            </div>

            {/* Active claim */}
            {report.active_claim && (
              <div className="rounded-xl border border-status-claimed-text/20 bg-status-claimed-bg px-4 py-3">
                <p className="text-[11px] font-semibold text-status-claimed-text uppercase tracking-wide mb-2">Active Claim</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-status-claimed-text/60 mb-0.5">Claimant</p>
                    <p className="text-status-claimed-text font-medium">
                      {report.active_claim.claimant?.first_name} {report.active_claim.claimant?.last_name}
                    </p>
                  </div>
                  {report.active_claim.claimant?.student_id && (
                    <div>
                      <p className="text-status-claimed-text/60 mb-0.5">Student ID</p>
                      <p className="text-status-claimed-text font-medium">{report.active_claim.claimant.student_id}</p>
                    </div>
                  )}
                  {report.active_claim.drop_off_chosen && (
                    <div className="col-span-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white/40 text-status-claimed-text px-2 py-0.5 rounded-full">
                        📍 ISSC drop-off chosen
                      </span>
                    </div>
                  )}
                </div>
                {claimPhotos.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold text-status-claimed-text/70 mb-1.5">Claim Photos</p>
                    <div className="flex gap-2 flex-wrap">
                      {claimPhotos.map((url, i) => (
                        <button key={i} onClick={() => setLightbox(url)} className="w-20 h-20 rounded-lg overflow-hidden border border-status-claimed-text/20 hover:opacity-90 transition-opacity shrink-0">
                          <img src={url} alt={`Claim photo ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Proxy request */}
            {report.proxy_request && (
              <div className="rounded-xl border border-status-approved-text/20 bg-status-approved-bg px-4 py-3">
                <p className="text-[11px] font-semibold text-status-approved-text uppercase tracking-wide mb-2">Proxy Pickup</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-status-approved-text/60 mb-0.5">Proxy Name</p>
                    <p className="text-status-approved-text font-medium">{report.proxy_request.proxy_name}</p>
                  </div>
                  <div>
                    <p className="text-status-approved-text/60 mb-0.5">Proxy Student ID</p>
                    <p className="text-status-approved-text font-medium">{report.proxy_request.proxy_student_id}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Rejected claim note */}
            {report.had_rejected_claim && (
              <div className="flex items-center gap-2 text-xs text-status-rejected-text bg-status-rejected-bg rounded-xl px-4 py-2.5">
                <AlertCircle size={13} className="shrink-0" />
                This report had a previously rejected claim.
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-2 px-6 py-4 border-t border-border shrink-0 flex-wrap">
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-surface-muted text-text-secondary text-xs font-semibold hover:bg-surface-card border border-border transition-colors"
            >
              <Share2 size={12} /> Share
            </button>
            {report.status === 'open' && report.type === 'found_walkin' && (
              <>
                <button
                  onClick={() => { onEdit(report); onClose() }}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-surface-muted text-text-secondary text-xs font-semibold hover:bg-surface-card border border-border transition-colors"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => { onDelete(report.id); onClose() }}
                  disabled={deletingId === report.id}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-status-rejected-bg text-status-rejected-text text-xs font-semibold border border-status-rejected-text/20 hover:opacity-80 transition-opacity disabled:opacity-50"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </>
            )}
            {report.status === 'open' && (
              <button
                onClick={() => onAnnounce(report.id, report.title)}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-surface-muted text-text-secondary text-xs font-semibold hover:bg-surface-card border border-border transition-colors"
              >
                <FileText size={12} /> Announce
              </button>
            )}
            {report.status === 'approved' && report.type === 'found_walkin' && !report.active_claim?.drop_off_chosen && (
              <button onClick={() => { onResolve(report, 'issc_walkin_pickup', true); onClose() }} disabled={resolving === report.id} className="px-3 h-9 rounded-lg bg-status-approved-bg text-status-approved-text text-xs font-semibold border border-status-approved-text/20 hover:opacity-80 transition-opacity whitespace-nowrap disabled:opacity-50">
                Record collection
              </button>
            )}
            {report.status === 'approved' && !report.active_claim?.drop_off_chosen && !report.proxy_request && report.type !== 'found_walkin' && (
              <button onClick={() => { onResolve(report, 'issc_walkin_pickup', false); onClose() }} disabled={resolving === report.id} className="px-3 h-9 rounded-lg bg-surface-muted text-text-secondary text-xs font-semibold border border-border hover:opacity-80 transition-opacity whitespace-nowrap disabled:opacity-50">
                Force resolve
              </button>
            )}
            {report.status === 'approved' && report.active_claim?.drop_off_chosen && (
              <a href="/dropoff" className="px-3 h-9 rounded-lg bg-status-claimed-bg text-status-claimed-text text-xs font-semibold border border-status-claimed-text/20 hover:opacity-80 transition-opacity whitespace-nowrap flex items-center gap-1.5">
                📍 View drop-off request
              </a>
            )}
            {report.status === 'approved' && report.proxy_request && !report.active_claim?.drop_off_chosen && (
              <button onClick={() => { onResolve(report, 'issc_dropoff', false, true); onClose() }} disabled={resolving === report.id} className="px-3 h-9 rounded-lg bg-status-approved-bg text-status-approved-text text-xs font-semibold border border-status-approved-text/20 hover:opacity-80 transition-opacity whitespace-nowrap disabled:opacity-50">
                Owner collected
              </button>
            )}
            <button onClick={onClose} className="ml-auto px-4 h-9 rounded-lg border border-border-strong text-xs font-medium text-text-secondary hover:bg-surface-muted transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

export default function ReportsPage() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')

  const [reports, setReports]         = useState([])
  const [total, setTotal]             = useState(0)
  const [offset, setOffset]           = useState(0)
  const [activeTab, setActiveTab]     = useState('all')
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [successMsg, setSuccessMsg]   = useState(null)
  const [resolving, setResolving]     = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmResolve, setConfirmResolve] = useState(null)
  const [confirmDelete, setConfirmDelete]   = useState(null)
  const [deletingId, setDeletingId]         = useState(null)
  const [viewReport, setViewReport]         = useState(null)
  const [editReport, setEditReport]         = useState(null)
  const [editForm, setEditForm]             = useState({})
  const [editSaving, setEditSaving]         = useState(false)
  const [ownerConfirmStatus, setOwnerConfirmStatus] = useState(null)

  const [handoffRecord, setHandoffRecord] = useState({
    verifiedStudentId: '', isProxy: false, proxyStudentId: '', notes: '',
  })
  const [idValidation, setIdValidation]           = useState(null)
  const [proxyIdValidation, setProxyIdValidation] = useState(null)
  const [verifiedOwnerName, setVerifiedOwnerName] = useState(null)
  const [verifiedProxyName, setVerifiedProxyName] = useState(null)
  const [validatingId, setValidatingId]           = useState(false)

  const searchTimer = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset,
        status: activeTab,
        ...(search ? { search } : {}),
      })
      const res  = await fetch(`${SERVER_URL}/reports?${params}`)
      const body = await res.json()
      setReports(body.reports ?? [])
      setTotal(body.total ?? 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeTab, offset, search])

  useEffect(() => { load() }, [load])

  // Auto-open detail dialog when navigating from notification highlight
  useEffect(() => {
    if (highlightId && reports.length > 0) {
      const found = reports.find((r) => r.id === highlightId)
      if (found) setViewReport(found)
    }
  }, [highlightId, reports])

  useEffect(() => {
    const channel = supabase
      .channel('admin-reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims'  }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  function handleSearchChange(e) {
    const val = e.target.value
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setOffset(0), 400)
  }

  function handleCloseConfirm() {
    setConfirmOpen(false)
    setConfirmResolve(null)
    setHandoffRecord({ verifiedStudentId: '', isProxy: false, proxyStudentId: '', notes: '' })
    setIdValidation(null)
    setProxyIdValidation(null)
    setVerifiedOwnerName(null)
    setVerifiedProxyName(null)
    setOwnerConfirmStatus(null)
  }

  async function validateStudentId(studentId, field) {
    if (!studentId.trim()) return
    setValidatingId(true)
    try {
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, student_id')
        .eq('student_id', studentId.trim().toUpperCase())
        .maybeSingle()
      if (!data) {
        if (field === 'owner') { setIdValidation('not-found'); setVerifiedOwnerName(null) }
        else { setProxyIdValidation('not-found'); setVerifiedProxyName(null) }
      } else {
        const name = `${data.first_name} ${data.last_name}`
        if (field === 'owner') { setIdValidation('found'); setVerifiedOwnerName(name) }
        else { setProxyIdValidation('found'); setVerifiedProxyName(name) }
      }
    } catch {
      if (field === 'owner') setIdValidation('error')
      else setProxyIdValidation('error')
    } finally {
      setValidatingId(false)
    }
  }

  async function handleConfirmResolve() {
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

  async function handleDelete(reportId) {
    setDeletingId(reportId)
    try {
      const { data: photos } = await supabase
        .from('report_photos').select('storage_path').eq('report_id', reportId)
      const { data: claimsData } = await supabase
        .from('claims').select('id').eq('report_id', reportId)
      for (const c of claimsData ?? []) {
        await supabase.from('claim_messages').delete().eq('claim_id', c.id)
        await supabase.from('claim_photos').delete().eq('claim_id', c.id)
      }
      await supabase.from('claims').delete().eq('report_id', reportId)
      await supabase.from('tips').delete().eq('report_id', reportId)
      if (photos?.length) {
        await supabase.storage.from('report-photos').remove(photos.map((p) => p.storage_path))
      }
      await supabase.from('report_photos').delete().eq('report_id', reportId)
      const { error: delErr } = await supabase.from('reports').delete().eq('id', reportId)
      if (delErr) throw delErr
      setSuccessMsg('Report deleted.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  async function handleAnnounce(reportId, reportTitle) {
    try {
      await fetch(`${SERVER_URL}/reports/${reportId}/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, reportTitle }),
      })
      setSuccessMsg('Announcement sent to all students.')
    } catch (err) {
      setError(err.message)
    }
  }

  function handleResolveFromDialog(report, via, isWalkIn, hasPreAuthorizedProxy = false) {
    setConfirmResolve({
      id: report.id,
      via,
      reporterStudentId: report.reporter_student_id,
      hasPreAuthorizedProxy,
      finderStudentId: report.active_claim?.claimant_student_id,
      isWalkIn,
    })
    setConfirmOpen(true)
  }

  const currentPage    = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages     = Math.ceil(total / PAGE_SIZE)
  const dropOffPending = reports.filter((r) => r.status === 'approved' && r.active_claim?.drop_off_chosen)
  const proxyPending   = reports.filter((r) => r.status === 'approved' && r.proxy_request && !r.active_claim?.drop_off_chosen)
  const isDropOff      = confirmResolve?.via === 'issc_dropoff'
  const isWalkIn       = confirmResolve?.isWalkIn === true
  const ownerAlreadyConfirmed = confirmResolve?.hasPreAuthorizedProxy || ownerConfirmStatus === 'approved'

  return (
    <div className="flex flex-col min-h-full">
      <Dialog open={!!error} onClose={() => setError(null)} tone="error" title="Error">{error}</Dialog>
      <Dialog open={!!successMsg} onClose={() => setSuccessMsg(null)} tone="success" title="Done">{successMsg}</Dialog>

      {/* Report detail dialog */}
      {viewReport && (
        <ReportDetailDialog
          report={viewReport}
          onClose={() => setViewReport(null)}
          onEdit={(r) => { setEditReport(r); setEditForm({ title: r.title, description: r.description ?? '', category: r.category ?? '', walkin_finder_ref: r.walkin_finder_ref ?? '' }) }}
          onDelete={(id) => setConfirmDelete(id)}
          onAnnounce={handleAnnounce}
          onResolve={handleResolveFromDialog}
          resolving={resolving}
          deletingId={deletingId}
        />
      )}

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
            <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1.5">Item name <span className="text-status-rejected-text">*</span></label>
                <input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1.5">Description <span className="text-status-rejected-text">*</span></label>
                <textarea rows={3} value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-md border border-border-strong bg-surface-page resize-none focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1.5">Category <span className="text-status-rejected-text">*</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button key={cat} type="button" onClick={() => setEditForm((f) => ({ ...f, category: cat === f.category ? '' : cat }))} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${editForm.category === cat ? 'bg-brand-600 text-white border-brand-600' : 'border-border-strong text-text-secondary hover:border-brand-400 hover:text-brand-600'}`}>{cat}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1.5">Finder Student ID <span className="text-status-rejected-text">*</span></label>
                <input value={editForm.walkin_finder_ref} onChange={(e) => setEditForm((f) => ({ ...f, walkin_finder_ref: e.target.value }))} className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="e.g. 24-00301" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
              <button onClick={() => setEditReport(null)} className="px-4 h-9 rounded-lg border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors">Cancel</button>
              <button onClick={handleEditSave} disabled={editSaving} className="px-5 h-9 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50">{editSaving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <div className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-status-rejected-bg flex items-center justify-center mb-3">
                <AlertCircle size={22} className="text-status-rejected-text" />
              </div>
              <h3 className="text-sm font-bold text-text-primary mb-1">Delete this report?</h3>
              <p className="text-xs text-text-secondary">This will permanently remove the report and all related data. This cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deletingId === confirmDelete} className="flex-1 h-11 rounded-xl bg-status-rejected-text text-white text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50">
                {deletingId === confirmDelete ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve confirm dialog */}
      {confirmOpen && confirmResolve && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <div className="bg-surface-card rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <p className="text-sm font-bold text-text-primary">
                  {isWalkIn ? 'Record owner collection' : isDropOff ? 'Record ISSC handoff' : 'Force resolve report?'}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {isWalkIn ? "Verify the owner's identity before releasing the item." : isDropOff ? 'Verify who is collecting the item from the ISSC office.' : 'This will mark the report as resolved without a verified handoff.'}
                </p>
              </div>
              <button onClick={handleCloseConfirm} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-muted"><X size={16} className="text-text-muted" /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              {isWalkIn ? (
                <div className="flex flex-col gap-4 mt-1">
                  <div>
                    <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">Who is collecting the item?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setHandoffRecord((r) => ({ ...r, isProxy: false, proxyStudentId: '' })); setProxyIdValidation(null); setVerifiedProxyName(null) }} className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${!handoffRecord.isProxy ? 'bg-brand-600 text-white border-brand-600' : 'border-border-strong text-text-secondary hover:border-brand-400'}`}>The owner</button>
                      <button type="button" onClick={() => { setHandoffRecord((r) => ({ ...r, isProxy: true, verifiedStudentId: '' })); setIdValidation(null); setVerifiedOwnerName(null) }} className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${handoffRecord.isProxy ? 'bg-brand-600 text-white border-brand-600' : 'border-border-strong text-text-secondary hover:border-brand-400'}`}>Someone else (proxy)</button>
                    </div>
                  </div>
                  {!handoffRecord.isProxy && (
                    <div>
                      <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">Verify Student ID</p>
                      <label className="text-xs font-medium text-text-secondary block mb-1">Owner Student ID</label>
                      <div className="flex gap-2">
                        <input value={handoffRecord.verifiedStudentId} onChange={(e) => { setHandoffRecord((r) => ({ ...r, verifiedStudentId: e.target.value })); setIdValidation(null); setVerifiedOwnerName(null) }} placeholder={confirmResolve?.reporterStudentId ?? 'e.g. 24-00301'} className="flex-1 h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400" />
                        <button onClick={() => validateStudentId(handoffRecord.verifiedStudentId, 'owner')} disabled={validatingId || !handoffRecord.verifiedStudentId.trim()} className="px-3 h-9 rounded-md bg-brand-600 text-white text-xs font-semibold disabled:opacity-50">{validatingId ? '…' : 'Verify'}</button>
                      </div>
                      {idValidation === 'found' && verifiedOwnerName && <p className="text-xs text-status-open-text mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> {verifiedOwnerName}</p>}
                      {idValidation === 'not-found' && <p className="text-xs text-status-rejected-text mt-1">Student ID not found in the system.</p>}
                    </div>
                  )}
                  {handoffRecord.isProxy && (
                    <div>
                      <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">Verify Proxy Student ID</p>
                      <label className="text-xs font-medium text-text-secondary block mb-1">Proxy Student ID</label>
                      <div className="flex gap-2">
                        <input value={handoffRecord.proxyStudentId} onChange={(e) => { setHandoffRecord((r) => ({ ...r, proxyStudentId: e.target.value })); setProxyIdValidation(null); setVerifiedProxyName(null) }} placeholder="e.g. 24-00301" className="flex-1 h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400" />
                        <button onClick={() => validateStudentId(handoffRecord.proxyStudentId, 'proxy')} disabled={validatingId || !handoffRecord.proxyStudentId.trim()} className="px-3 h-9 rounded-md bg-brand-600 text-white text-xs font-semibold disabled:opacity-50">{validatingId ? '…' : 'Verify'}</button>
                      </div>
                      {proxyIdValidation === 'found' && verifiedProxyName && <p className="text-xs text-status-open-text mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> {verifiedProxyName}</p>}
                      {proxyIdValidation === 'not-found' && <p className="text-xs text-status-rejected-text mt-1">Student ID not found in the system.</p>}
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">Notes (optional)</label>
                    <input value={handoffRecord.notes} onChange={(e) => setHandoffRecord((r) => ({ ...r, notes: e.target.value }))} className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
                </div>
              ) : isDropOff ? (
                <div className="flex flex-col gap-4 mt-1">
                  <div>
                    <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">Who is picking up the item?</p>
                    {confirmResolve?.hasPreAuthorizedProxy ? (
                      <div className="flex items-center gap-2 text-xs text-status-open-text bg-status-open-bg rounded-lg px-3 py-2.5">
                        <CheckCircle2 size={12} className="shrink-0" />A proxy was pre-authorized by the owner via the app.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setHandoffRecord((r) => ({ ...r, isProxy: false, proxyStudentId: '' })); setProxyIdValidation(null); setVerifiedProxyName(null) }} className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${!handoffRecord.isProxy ? 'bg-brand-600 text-white border-brand-600' : 'border-border-strong text-text-secondary hover:border-brand-400'}`}>The owner</button>
                        <button type="button" onClick={() => { setHandoffRecord((r) => ({ ...r, isProxy: true, verifiedStudentId: '' })); setIdValidation(null); setVerifiedOwnerName(null) }} className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${handoffRecord.isProxy ? 'bg-brand-600 text-white border-brand-600' : 'border-border-strong text-text-secondary hover:border-brand-400'}`}>Someone else (proxy)</button>
                      </div>
                    )}
                  </div>
                  {!ownerAlreadyConfirmed && !handoffRecord.isProxy && !confirmResolve?.hasPreAuthorizedProxy && (
                    <div>
                      <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">Verify Student ID</p>
                      <label className="text-xs font-medium text-text-secondary block mb-1">Owner Student ID</label>
                      <div className="flex gap-2">
                        <input value={handoffRecord.verifiedStudentId} onChange={(e) => { setHandoffRecord((r) => ({ ...r, verifiedStudentId: e.target.value })); setIdValidation(null); setVerifiedOwnerName(null) }} placeholder={confirmResolve?.reporterStudentId ?? 'e.g. 24-00301'} className="flex-1 h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400" />
                        <button onClick={() => validateStudentId(handoffRecord.verifiedStudentId, 'owner')} disabled={validatingId || !handoffRecord.verifiedStudentId.trim()} className="px-3 h-9 rounded-md bg-brand-600 text-white text-xs font-semibold disabled:opacity-50">{validatingId ? '…' : 'Verify'}</button>
                      </div>
                      {idValidation === 'found' && verifiedOwnerName && <p className="text-xs text-status-open-text mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> {verifiedOwnerName}</p>}
                      {idValidation === 'not-found' && <p className="text-xs text-status-rejected-text mt-1">Student ID not found in the system.</p>}
                    </div>
                  )}
                  {(handoffRecord.isProxy || confirmResolve?.hasPreAuthorizedProxy) && (
                    <div>
                      <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">Verify Proxy Student ID</p>
                      <label className="text-xs font-medium text-text-secondary block mb-1">Proxy Student ID</label>
                      <div className="flex gap-2">
                        <input value={handoffRecord.proxyStudentId} onChange={(e) => { setHandoffRecord((r) => ({ ...r, proxyStudentId: e.target.value })); setProxyIdValidation(null); setVerifiedProxyName(null) }} placeholder={confirmResolve?.finderStudentId ?? 'e.g. 24-00301'} className="flex-1 h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400" />
                        <button onClick={() => validateStudentId(handoffRecord.proxyStudentId, 'proxy')} disabled={validatingId || !handoffRecord.proxyStudentId.trim()} className="px-3 h-9 rounded-md bg-brand-600 text-white text-xs font-semibold disabled:opacity-50">{validatingId ? '…' : 'Verify'}</button>
                      </div>
                      {proxyIdValidation === 'found' && verifiedProxyName && <p className="text-xs text-status-open-text mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> {verifiedProxyName}</p>}
                      {proxyIdValidation === 'not-found' && <p className="text-xs text-status-rejected-text mt-1">Student ID not found in the system.</p>}
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">Notes (optional)</label>
                    <input value={handoffRecord.notes} onChange={(e) => setHandoffRecord((r) => ({ ...r, notes: e.target.value }))} className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-secondary mt-1">Are you sure you want to mark this report as resolved? This action cannot be undone.</p>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-border shrink-0">
              <button onClick={handleCloseConfirm} className="flex-1 h-10 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors">Cancel</button>
              <button
                onClick={handleConfirmResolve}
                disabled={(isWalkIn && !handoffRecord.isProxy && idValidation !== 'found') || (isWalkIn && handoffRecord.isProxy && proxyIdValidation !== 'found')}
                className="flex-1 h-10 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-brand-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-lg font-bold text-text-primary">Reports</h1>
        <p className="text-xs text-text-muted mt-0.5">
          {total} report{total !== 1 ? 's' : ''} total
          {dropOffPending.length > 0 && <span className="ml-2 text-status-claimed-text font-semibold">· {dropOffPending.length} ISSC drop-off pending</span>}
          {proxyPending.length > 0 && <span className="ml-2 text-status-approved-text font-semibold">· {proxyPending.length} proxy pickup pending</span>}
        </p>
      </div>

      {/* Search + filter */}
      <div className="px-6 pt-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input type="search" placeholder="Search by title or location…" value={search} onChange={handleSearchChange} className="w-full h-9 pl-9 pr-9 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"><X size={14} /></button>}
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button key={tab.value} onClick={() => { setActiveTab(tab.value); setOffset(0) }} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === tab.value ? 'bg-brand-600 text-white' : 'text-text-secondary hover:bg-surface-muted border border-border-strong'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-4 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-semibold text-text-primary mb-1">No reports found</p>
            <p className="text-xs text-text-muted">Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm border-collapse bg-surface-card">
              <thead>
                <tr className="bg-surface-muted">
                  <th className="py-2 px-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Item</th>
                  <th className="py-2 px-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Reporter</th>
                  <th className="py-2 px-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Status</th>
                  <th className="py-2 px-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Filed</th>
                  <th className="py-2 px-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className={`border-b border-border hover:bg-surface-muted transition-colors cursor-pointer ${r.id === highlightId ? 'bg-status-open-bg' : 'bg-surface-card'}`}>
                    <td className="py-2 px-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        {r.active_claim?.drop_off_chosen && <MapPin size={12} className="text-status-claimed-text shrink-0" title="ISSC drop-off chosen" />}
                        {r.proxy_request && <MapPin size={12} className="text-status-approved-text shrink-0" title="Proxy pickup requested" />}
                        <button onClick={() => setViewReport(r)} className="text-left hover:text-brand-600 transition-colors font-medium text-sm">
                          {r.title}
                        </button>
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">{r.category}</p>
                    </td>
                    <td className="py-2 px-3 text-text-secondary text-xs">{r.reporter_name ?? '—'}</td>
                    <td className="py-2 px-3"><StatusBadge status={r.status} /></td>
                    <td className="py-2 px-3 text-text-muted text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => setViewReport(r)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-muted text-text-secondary text-[11px] font-semibold hover:bg-surface-card border border-border transition-colors">
                          <Eye size={11} /> View
                        </button>
                        {r.status === 'open' && (
                          <button onClick={() => handleAnnounce(r.id, r.title)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-muted text-text-secondary text-[11px] font-semibold hover:bg-surface-card border border-border transition-colors">
                            Announce
                          </button>
                        )}
                        {r.status === 'approved' && r.type === 'found_walkin' && !r.active_claim?.drop_off_chosen && (
                          <button onClick={() => { setConfirmResolve({ id: r.id, via: 'issc_walkin_pickup', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: false, isWalkIn: true }); setConfirmOpen(true) }} disabled={resolving === r.id} className="px-2.5 py-1 rounded-lg bg-status-approved-bg text-status-approved-text text-[11px] font-semibold border border-status-approved-text/20 hover:opacity-80 transition-opacity whitespace-nowrap">
                            Record collection
                          </button>
                        )}
                        {r.status === 'approved' && !r.active_claim?.drop_off_chosen && !r.proxy_request && r.type !== 'found_walkin' && (
                          <button onClick={() => { setConfirmResolve({ id: r.id, via: 'issc_walkin_pickup', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: false }); setConfirmOpen(true) }} disabled={resolving === r.id} className="px-2.5 py-1 rounded-lg bg-surface-muted text-text-secondary text-[11px] font-semibold border border-border hover:opacity-80 transition-opacity whitespace-nowrap">
                            Force resolve
                          </button>
                        )}
                        {r.status === 'approved' && r.active_claim?.drop_off_chosen && (
                          <a href="/dropoff" className="px-2.5 py-1 rounded-lg bg-status-claimed-bg text-status-claimed-text text-[11px] font-semibold border border-status-claimed-text/20 hover:opacity-80 transition-opacity whitespace-nowrap flex items-center gap-1">
                            📍 Drop-off
                          </a>
                        )}
                        {r.status === 'approved' && r.proxy_request && !r.active_claim?.drop_off_chosen && (
                          <button onClick={() => { setConfirmResolve({ id: r.id, via: 'issc_dropoff', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: !!r.proxy_request, finderStudentId: r.active_claim?.claimant_student_id }); setConfirmOpen(true) }} disabled={resolving === r.id} className="px-2.5 py-1 rounded-lg bg-status-approved-bg text-status-approved-text text-[11px] font-semibold border border-status-approved-text/20 hover:opacity-80 transition-opacity whitespace-nowrap">
                            Owner collected
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-xs text-text-muted">Page {currentPage} of {totalPages} · {total} total</p>
          <div className="flex gap-2">
            <button onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} disabled={offset === 0} className="w-8 h-8 rounded-lg border border-border-strong flex items-center justify-center text-text-secondary hover:bg-surface-muted disabled:opacity-40 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setOffset((o) => o + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="w-8 h-8 rounded-lg border border-border-strong flex items-center justify-center text-text-secondary hover:bg-surface-muted disabled:opacity-40 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}