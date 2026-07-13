import { useEffect, useState, useRef } from 'react'
import { Search, X, MapPin, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, UserCheck } from 'lucide-react'
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

const EMPTY_HANDOFF = { verifiedStudentId: '', notes: '', isProxy: false, proxyName: '', proxyStudentId: '' }

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
  const [handoffRecord, setHandoffRecord] = useState(EMPTY_HANDOFF)
  const [validatingId, setValidatingId] = useState(false)
  const [idValidation, setIdValidation] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [confirmingOwner, setConfirmingOwner] = useState(false)
  const [ownerConfirmSent, setOwnerConfirmSent] = useState(false)
  const [ownerConfirmStatus, setOwnerConfirmStatus] = useState(null) // null | 'approved' | 'denied'
  const pollRef = useRef(null)
  const debounceRef = useRef(null)
  const validateRef = useRef(null)

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
    clearTimeout(validateRef.current)
    if (!value.trim()) return
    validateRef.current = setTimeout(() => validateStudentId(value), 600)
  }

  async function validateStudentId(studentId) {
    setValidatingId(true)
    try {
      const inputId = studentId.trim().toUpperCase()
      if (handoffRecord.isProxy && confirmResolve?.hasPreAuthorizedProxy) {
        const expectedId = handoffRecord.proxyStudentId?.toUpperCase()
        if (expectedId && inputId !== expectedId) {
          setIdValidation('invalid')
          setValidatingId(false)
          return
        }
      } else if (!handoffRecord.isProxy) {
        const reporterStudentId = confirmResolve?.reporterStudentId?.toUpperCase()
        if (reporterStudentId && inputId !== reporterStudentId) {
          setIdValidation('invalid')
          setValidatingId(false)
          return
        }
      }
      const res = await fetch(`${SERVER_URL}/accounts?search=${encodeURIComponent(inputId)}&limit=5`)
      const body = await res.json()
      const exact = (body.accounts ?? []).find((a) => a.student_id === inputId)
      setIdValidation(exact ? 'valid' : 'invalid')
    } catch {
      setIdValidation(null)
    } finally {
      setValidatingId(false)
    }
  }

  function handleCloseConfirm() {
    setConfirmOpen(false)
    setHandoffRecord(EMPTY_HANDOFF)
    setIdValidation(null)
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
    if (!handoffRecord.proxyName.trim() || !handoffRecord.proxyStudentId.trim()) return
    setConfirmingOwner(true)
    try {
      const report = reports.find((r) => r.id === confirmResolve.id)
      const res = await fetch(`${SERVER_URL}/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: confirmResolve.id,
          reporterId: report?.reporter?.id,
          proxyName: handoffRecord.proxyName.trim(),
          proxyStudentId: handoffRecord.proxyStudentId.trim(),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setOwnerConfirmSent(true)
      // Poll every 5 seconds for owner response
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
    handleCloseConfirm()
    setResolving(id)
    try {
      const res = await fetch(`${SERVER_URL}/reports/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedVia: via,
          verifiedStudentId: handoffRecord.verifiedStudentId,
          notes: handoffRecord.notes,
          isProxy: handoffRecord.isProxy,
          proxyName: handoffRecord.proxyName,
          proxyStudentId: handoffRecord.proxyStudentId,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setSuccessMsg('Report marked as resolved and handoff recorded.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setResolving(null)
    }
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const dropOffPending = reports.filter((r) => r.status === 'approved' && r.active_claim?.drop_off_chosen)
  const proxyPending = reports.filter((r) => r.status === 'approved' && r.proxy_request && !r.active_claim?.drop_off_chosen)
  const isDropOff = confirmResolve?.via === 'issc_dropoff'
  const ownerAlreadyConfirmed = confirmResolve?.hasPreAuthorizedProxy || ownerConfirmStatus === 'approved'
  const canConfirmHandoff = !isDropOff || ownerAlreadyConfirmed || (
    handoffRecord.verifiedStudentId.trim() &&
    idValidation === 'valid' &&
    (!handoffRecord.isProxy || (handoffRecord.proxyName.trim() && handoffRecord.proxyStudentId.trim()))
  )

  return (
    <div>
      <Dialog open={!!error} onClose={() => setError(null)} tone="error" title="Error">
        {error}
      </Dialog>
      <Dialog open={!!successMsg} onClose={() => setSuccessMsg(null)} tone="success" title="Done">
        {successMsg}
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={handleCloseConfirm}
        tone="info"
        title={isDropOff ? 'Record ISSC handoff' : 'Force resolve report?'}
        primaryAction={{
          label: isDropOff ? 'Confirm handoff' : 'Yes, resolve',
          onClick: handleForceResolve,
          disabled: !canConfirmHandoff,
        }}
        secondaryAction={{ label: 'Cancel', onClick: handleCloseConfirm }}
      >
        {isDropOff ? (
          <div className="flex flex-col gap-4 mt-1">

            {/* Step 1: Verify ID — skip if owner already confirmed */}
            {!ownerAlreadyConfirmed && (
              <div className="bg-surface-muted rounded-xl p-3 flex flex-col gap-2">
                <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                  Step 1 — Verify ID
                </p>
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">
                    {handoffRecord.isProxy ? "Proxy's Student ID" : "Owner's Student ID"}{' '}
                    <span className="text-status-rejected-text">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={handoffRecord.isProxy ? 'e.g. 22-00150' : 'e.g. 24-00301'}
                      value={handoffRecord.verifiedStudentId}
                      onChange={(e) => handleStudentIdChange(e.target.value)}
                      className={`w-full h-9 px-3 text-sm rounded-md border bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                        idValidation === 'invalid'
                          ? 'border-status-rejected-text'
                          : idValidation === 'valid'
                            ? 'border-status-open-text'
                            : 'border-border-strong'
                      }`}
                    />
                    {validatingId && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">Checking…</span>
                    )}
                  </div>
                  {idValidation === 'invalid' && (
                    <p className="text-[11px] text-status-rejected-text mt-1 flex items-center gap-1">
                      <AlertCircle size={11} />
                      {handoffRecord.isProxy ? "ID does not match the proxy's record." : "ID does not match the owner's record."}
                    </p>
                  )}
                  {idValidation === 'valid' && (
                    <p className="text-[11px] text-status-open-text mt-1 flex items-center gap-1">
                      <CheckCircle2 size={11} /> ID verified.
                    </p>
                  )}
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

            {/* Step 2: Proxy pickup */}
            <div className="bg-surface-muted rounded-xl p-3 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                Step 2 — Proxy pickup
              </p>

              {confirmResolve?.hasPreAuthorizedProxy ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-status-open-text bg-status-open-bg rounded-lg px-3 py-2">
                    <CheckCircle2 size={12} className="shrink-0" />
                    Pre-authorized by the owner via the app. No further action needed.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-surface-card rounded-lg px-3 py-2">
                      <p className="text-[10px] text-text-muted mb-0.5">Proxy name</p>
                      <p className="text-xs font-medium text-text-primary">{handoffRecord.proxyName}</p>
                    </div>
                    <div className="bg-surface-card rounded-lg px-3 py-2">
                      <p className="text-[10px] text-text-muted mb-0.5">Proxy Student ID</p>
                      <p className="text-xs font-medium text-text-primary">{handoffRecord.proxyStudentId}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
                      handoffRecord.isProxy ? 'bg-brand-600' : 'bg-border-strong'
                    }`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        handoffRecord.isProxy ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </div>
                    <input
                      type="checkbox"
                      checked={handoffRecord.isProxy}
                      onChange={(e) => {
                        setHandoffRecord((r) => ({ ...r, isProxy: e.target.checked }))
                        setIdValidation(null)
                      }}
                      className="sr-only"
                    />
                    <span className="text-xs text-text-secondary">
                      Someone else is picking up on behalf of the owner
                    </span>
                  </label>

                  {handoffRecord.isProxy && (
                    <div className="flex flex-col gap-2 pl-3 border-l-2 border-brand-200">
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">
                          Proxy's full name <span className="text-status-rejected-text">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Full name of the person picking up"
                          value={handoffRecord.proxyName}
                          onChange={(e) => setHandoffRecord((r) => ({ ...r, proxyName: e.target.value }))}
                          className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">
                          Proxy's Student ID <span className="text-status-rejected-text">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 23-00456"
                          value={handoffRecord.proxyStudentId}
                          onChange={(e) => setHandoffRecord((r) => ({ ...r, proxyStudentId: e.target.value }))}
                          className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>
                      <div className="pt-1">
                        {ownerConfirmStatus === 'approved' && (
                          <div className="flex items-start gap-2 text-xs text-status-open-text bg-status-open-bg rounded-lg px-3 py-2.5">
                            <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold mb-0.5">Owner approved.</p>
                              <p>You may release the item. Fill in the proxy's student ID above and confirm handoff.</p>
                            </div>
                          </div>
                        )}
                        {ownerConfirmStatus === 'denied' && (
                          <div className="flex items-start gap-2 text-xs text-status-rejected-text bg-status-rejected-bg rounded-lg px-3 py-2.5">
                            <AlertCircle size={13} className="shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold mb-0.5">Owner denied.</p>
                              <p>Do not release the item to this person.</p>
                            </div>
                          </div>
                        )}
                        {!ownerConfirmStatus && (
                          ownerConfirmSent ? (
                            <div className="flex items-center gap-2 text-xs text-status-claimed-text bg-status-claimed-bg rounded-lg px-3 py-2">
                              <div className="w-3 h-3 rounded-full border-2 border-status-claimed-text border-t-transparent animate-spin shrink-0" />
                              Waiting for owner response…
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={requestOwnerConfirmation}
                              disabled={confirmingOwner || !handoffRecord.proxyName.trim() || !handoffRecord.proxyStudentId.trim()}
                              className="w-full h-9 rounded-lg border border-brand-600 text-brand-600 text-xs font-semibold hover:bg-brand-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {confirmingOwner ? 'Sending…' : 'Request owner confirmation'}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Step 3: Notes */}
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Notes <span className="text-text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Handed over at front desk, 2:30PM"
                value={handoffRecord.notes}
                onChange={(e) => setHandoffRecord((r) => ({ ...r, notes: e.target.value }))}
                className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

          </div>
        ) : (
          'This will force-resolve the report. Use only when the reporter is unresponsive past the reminder cadence (FR-5).'
        )}
      </Dialog>

      {/* Sticky header */}
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
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

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
                    setConfirmResolve({ id: r.id, via: 'issc_dropoff', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: true })
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
                    setConfirmResolve({ id: r.id, via: 'issc_dropoff', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: !!r.proxy_request })
                    if (r.proxy_request) {
                      setHandoffRecord((prev) => ({ ...prev, isProxy: true, proxyName: r.proxy_request.proxy_name, proxyStudentId: r.proxy_request.proxy_student_id }))
                    }
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

      {/* Status tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
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
          <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted border-b border-border">
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
                  <tr key={r.id} className="border-b border-border last:border-0">
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
                    <td className="py-2 px-3 text-text-secondary">{r.type === 'found_walkin' ? 'Walk-in' : 'Lost'}</td>
                    <td className="py-2 px-3 text-text-secondary">{r.location}</td>
                    <td className="py-2 px-3 text-text-secondary">{r.reporter_name}</td>
                    <td className="py-2 px-3 text-text-secondary">{r.active_claim?.claimant_name ?? '—'}</td>
                    <td className="py-2 px-3"><StatusPill status={r.status} /></td>
                    <td className="py-2 px-3 text-text-muted text-xs">{timeAgo(r.created_at)}</td>
                    <td className="py-2 px-3">
                      {r.status === 'approved' && !r.active_claim?.drop_off_chosen && !r.proxy_request && (
                        <button
                          onClick={() => {
                            setConfirmResolve({ id: r.id, via: 'issc_walkin_pickup', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: false })
                            setConfirmOpen(true)
                          }}
                          disabled={resolving === r.id}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-status-rejected-text/30 text-status-rejected-text hover:bg-status-rejected-bg transition-colors disabled:opacity-40"
                        >
                          Force resolve
                        </button>
                      )}
                      {r.status === 'approved' && r.active_claim?.drop_off_chosen && (
                        <button
                          onClick={() => {
                            setConfirmResolve({ id: r.id, via: 'issc_dropoff', reporterStudentId: r.reporter_student_id, hasPreAuthorizedProxy: !!r.proxy_request })
                            if (r.proxy_request) {
                              setHandoffRecord((prev) => ({ ...prev, isProxy: true, proxyName: r.proxy_request.proxy_name, proxyStudentId: r.proxy_request.proxy_student_id }))
                            }
                            setConfirmOpen(true)
                          }}
                          disabled={resolving === r.id}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-40 flex items-center gap-1"
                        >
                          <CheckCircle2 size={11} />
                          Mark handed over
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-text-muted">{total} report{total === 1 ? '' : 's'} total</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="p-1.5 rounded-md border border-border-strong hover:bg-surface-muted disabled:opacity-30"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs text-text-secondary px-2">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="p-1.5 rounded-md border border-border-strong hover:bg-surface-muted disabled:opacity-30"
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