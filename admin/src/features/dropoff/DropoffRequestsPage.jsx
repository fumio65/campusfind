import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { PackageCheck, Clock, CheckCircle2, ImagePlus, ArrowLeft, X, AlertCircle, User } from 'lucide-react'
import { supabase } from '../../shared/lib/supabaseClient'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const STATUS_STYLES = {
  pending:  { label: 'Pending',  bg: 'bg-status-claimed-bg',  text: 'text-status-claimed-text'  },
  received: { label: 'Received', bg: 'bg-status-approved-bg', text: 'text-status-approved-text' },
  resolved: { label: 'Resolved', bg: 'bg-status-resolved-bg', text: 'text-status-resolved-text' },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Pickup Verification Dialog ───────────────────────────────────────────────
function PickupDialog({ request, onClose, onConfirm, actioning }) {
  const [studentId, setStudentId]       = useState('')
  const [validation, setValidation]     = useState(null)
  const [verifiedName, setVerifiedName] = useState(null)
  const [validating, setValidating]     = useState(false)
  const [proxyRecord, setProxyRecord]   = useState(null)
  const [loadingProxy, setLoadingProxy] = useState(true)
  const debounceRef = useRef(null)

  // Auto-select proxy path if a proxy record exists
  const hasProxy = !!proxyRecord
  const [isProxy, setIsProxy] = useState(false)

  useEffect(() => { fetchProxyRecord() }, [])

  async function fetchProxyRecord() {
    setLoadingProxy(true)
    try {
      const { data } = await supabase
        .from('proxy_requests')
        .select('proxy_student_id, proxy_name')
        .eq('report_id', request.report_id)
        .maybeSingle()
      setProxyRecord(data ?? null)
      if (data) setIsProxy(true) // auto-select proxy path when proxy exists
    } catch {
      setProxyRecord(null)
    } finally {
      setLoadingProxy(false)
    }
  }

  function reset() {
    setStudentId('')
    setValidation(null)
    setVerifiedName(null)
    clearTimeout(debounceRef.current)
  }

  async function validateId(id) {
    if (!id.trim()) { setValidation(null); setVerifiedName(null); return }
    const isValidFormat = /^\d{2}-\d{5}$/.test(id.trim().toUpperCase())
    if (!isValidFormat) { setValidation(null); setVerifiedName(null); return }
    setValidating(true)
    try {
      const { data: user } = await supabase
        .from('users')
        .select('id, first_name, last_name, student_id')
        .eq('student_id', id.trim().toUpperCase())
        .maybeSingle()
      if (!user) { setValidation('not-found'); return }
      const fullName = `${user.first_name} ${user.last_name}`
      if (!isProxy) {
        if (user.student_id === request.reporter?.student_id) {
          setValidation('found'); setVerifiedName(fullName)
        } else {
          setValidation('wrong-owner'); setVerifiedName(fullName)
        }
      } else {
        if (proxyRecord && user.student_id === proxyRecord.proxy_student_id) {
          setValidation('found'); setVerifiedName(fullName)
        } else {
          setValidation('wrong-proxy'); setVerifiedName(fullName)
        }
      }
    } catch {
      setValidation('not-found')
    } finally {
      setValidating(false)
    }
  }

  function handleStudentIdChange(e) {
    const val = e.target.value
    setStudentId(val)
    setValidation(null)
    setVerifiedName(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => validateId(val), 500)
  }

  const canConfirm = validation === 'found'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface-card rounded-2xl w-full max-w-sm shadow-xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-surface-muted flex items-center justify-center">
            <ArrowLeft size={16} className="text-text-secondary" />
          </button>
          <div>
            <p className="text-sm font-bold text-text-primary">Confirm pickup</p>
            <p className="text-[11px] text-text-muted mt-0.5">Verify identity before releasing the item</p>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Item info — names only, no IDs */}
          <div className="bg-surface-muted rounded-xl px-3 py-2.5">
            <p className="text-xs font-semibold text-text-primary">{request.reports?.title ?? 'Unknown item'}</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              Owner: {request.reporter?.first_name} {request.reporter?.last_name}
            </p>
            {proxyRecord && (
              <p className="text-[11px] text-status-approved-text mt-0.5">
                Authorized proxy: {proxyRecord.proxy_name}
              </p>
            )}
          </div>

          {/* Who is collecting */}
          <div>
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">
              Who is collecting the item?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setIsProxy(false); reset() }}
                disabled={hasProxy} // owner path disabled when proxy is authorized
                className={`h-9 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  !isProxy ? 'bg-brand-600 text-white border-brand-600' : 'border-border-strong text-text-secondary hover:border-brand-400'
                }`}
              >
                The owner
              </button>
              <button
                type="button"
                onClick={() => { setIsProxy(true); reset() }}
                disabled={!proxyRecord && !loadingProxy}
                className={`h-9 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isProxy ? 'bg-brand-600 text-white border-brand-600' : 'border-border-strong text-text-secondary hover:border-brand-400'
                }`}
              >
                Proxy
              </button>
            </div>
            {!proxyRecord && !loadingProxy && (
              <p className="text-[10px] text-text-muted mt-1.5">No proxy was authorized for this report.</p>
            )}
            {hasProxy && (
              <p className="text-[10px] text-status-approved-text mt-1.5">
                A proxy was authorized — only the proxy may collect this item.
              </p>
            )}
          </div>

          {/* Student ID input — inline live validation */}
          <div>
            <label className="text-xs font-semibold text-text-secondary block mb-1.5">
              {isProxy ? 'Proxy Student ID' : 'Owner Student ID'}
              <span className="text-status-rejected-text ml-0.5">*</span>
            </label>
            <div className="relative">
              <input
                value={studentId}
                onChange={handleStudentIdChange}
                placeholder="e.g. 24-00301"
                maxLength={8}
                className={`w-full h-9 px-3 pr-8 text-sm rounded-lg border bg-surface-page focus:outline-none focus:ring-2 transition-colors ${
                  validation === 'found'
                    ? 'border-status-open-text focus:ring-status-open-text/40'
                    : validation !== null
                    ? 'border-status-rejected-text focus:ring-status-rejected-text/40'
                    : 'border-border-strong focus:ring-brand-400'
                }`}
              />
              {validating && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
              )}
              {!validating && validation === 'found' && (
                <CheckCircle2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-status-open-text" />
              )}
              {!validating && validation !== null && validation !== 'found' && (
                <AlertCircle size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-status-rejected-text" />
              )}
            </div>

            {validation === 'found' && verifiedName && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-status-open-text">
                <CheckCircle2 size={13} className="shrink-0" />
                <span>{verifiedName} — identity confirmed</span>
              </div>
            )}
            {validation === 'not-found' && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-status-rejected-text">
                <AlertCircle size={13} className="shrink-0" />
                <span>Student ID not found in the system.</span>
              </div>
            )}
            {validation === 'wrong-owner' && verifiedName && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-status-rejected-text">
                <AlertCircle size={13} className="shrink-0" />
                <span>{verifiedName} is not the owner of this report. Do not release the item.</span>
              </div>
            )}
            {validation === 'wrong-proxy' && verifiedName && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-status-rejected-text">
                <AlertCircle size={13} className="shrink-0" />
                <span>{verifiedName} does not match the authorized proxy. Do not release the item.</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(request.id, isProxy)}
            disabled={!canConfirm || actioning}
            className="flex-1 h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-brand-700 transition-colors"
          >
            {actioning ? 'Confirming…' : 'Release item'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DropoffRequestsPage() {
  const [requests, setRequests]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('pending')
  const [selected, setSelected]           = useState(null)
  const [pickupRequest, setPickupRequest] = useState(null)
  const [photo, setPhoto]                 = useState(null)
  const [photoPreview, setPhotoPreview]   = useState(null)
  const [actioning, setActioning]         = useState(false)
  const [lightboxUrl, setLightboxUrl]     = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    fetchRequests()
    const channel = supabase
      .channel('dropoff-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dropoff_requests' }, () => fetchRequests())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [filter])

  async function fetchRequests() {
    setLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/dropoff?status=${filter}`, {
        headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      setRequests(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('fetchRequests error:', err)
      setRequests([])
    }
    setLoading(false)
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleReceive() {
    if (!photo || !selected) return
    setActioning(true)
    try {
      const ext  = photo.name.split('.').pop()
      const path = `dropoff/${selected.id}/${Date.now()}.${ext}`
      await supabase.storage.from('report-photos').upload(path, photo)
      await fetch(`${SERVER_URL}/dropoff/${selected.id}/receive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({ photoPath: path }),
      })
      setSelected(null)
      setPhoto(null)
      setPhotoPreview(null)
      fetchRequests()
    } catch (err) {
      console.error(err)
    }
    setActioning(false)
  }

  async function handlePickupConfirm(requestId, isProxy) {
    setActioning(true)
    try {
      await fetch(`${SERVER_URL}/dropoff/${requestId}/pickup`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({ isProxy }),
      })
      setPickupRequest(null)
      fetchRequests()
    } catch (err) {
      console.error(err)
    }
    setActioning(false)
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
          <button className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white" onClick={() => setLightboxUrl(null)}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Receive dialog */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => { setSelected(null); setPhoto(null); setPhotoPreview(null) }}
                className="w-8 h-8 rounded-full hover:bg-surface-muted flex items-center justify-center"
              >
                <ArrowLeft size={16} className="text-text-secondary" />
              </button>
              <h3 className="text-sm font-bold text-text-primary">Mark item as received</h3>
            </div>

            {/* Names only — no student IDs */}
            <div className="bg-surface-muted rounded-xl p-3 mb-4">
              <p className="text-xs font-semibold text-text-primary">
                {selected.reports?.title ?? 'Unknown item'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Dropped off by {selected.claimant?.first_name} {selected.claimant?.last_name}
              </p>
              <p className="text-xs text-text-muted">
                Owner: {selected.reporter?.first_name} {selected.reporter?.last_name}
              </p>
            </div>

            <p className="text-xs text-text-secondary mb-3">
              Take a photo of the item as proof that it has been received at the ISSC office.
            </p>

            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />

            {photoPreview ? (
              <div className="relative mb-4">
                <img src={photoPreview} alt="" className="w-full h-40 object-cover rounded-xl border border-border" />
                <button
                  onClick={() => { setPhoto(null); setPhotoPreview(null) }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full h-32 rounded-xl border-2 border-dashed border-border-strong flex flex-col items-center justify-center gap-2 mb-4 hover:border-brand-400 transition-colors"
              >
                <ImagePlus size={24} className="text-text-muted" />
                <p className="text-xs text-text-muted">Tap to take or upload a photo</p>
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setSelected(null); setPhoto(null); setPhotoPreview(null) }}
                className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReceive}
                disabled={!photo || actioning}
                className="flex-1 h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {actioning ? 'Saving…' : 'Confirm received'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Pickup verification dialog */}
      {pickupRequest && (
        <PickupDialog
          request={pickupRequest}
          onClose={() => setPickupRequest(null)}
          onConfirm={handlePickupConfirm}
          actioning={actioning}
        />
      )}

      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-lg font-bold text-text-primary">Drop-off Requests</h1>
        <p className="text-xs text-text-muted mt-0.5">Manage ISSC drop-off requests from finders</p>
      </div>

      {/* Filter tabs */}
      <div className="px-6 pt-4 flex gap-2">
        {['pending', 'received', 'resolved'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === s ? 'bg-brand-600 text-white' : 'bg-surface-muted text-text-secondary hover:bg-surface-card'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="px-6 py-4 flex flex-col gap-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-surface-card rounded-2xl animate-pulse border border-border" />
          ))
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center mb-3">
              <PackageCheck size={22} className="text-text-muted" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">No {filter} requests</p>
            <p className="text-xs text-text-muted">Drop-off requests will appear here.</p>
          </div>
        ) : (
          requests.map((req) => {
            const statusStyle = STATUS_STYLES[req.status] ?? STATUS_STYLES.pending
            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-card rounded-2xl border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {req.reports?.title ?? 'Unknown item'}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{req.reports?.category ?? '—'}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${statusStyle.bg} ${statusStyle.text}`}>
                    {statusStyle.label}
                  </span>
                </div>

                {/* Names only — no student IDs */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-surface-muted rounded-xl px-3 py-2">
                    <p className="text-[10px] text-text-muted mb-0.5">Finder</p>
                    <p className="text-xs font-medium text-text-primary">
                      {req.claimant?.first_name} {req.claimant?.last_name}
                    </p>
                  </div>
                  <div className="bg-surface-muted rounded-xl px-3 py-2">
                    <p className="text-[10px] text-text-muted mb-0.5">Owner</p>
                    <p className="text-xs font-medium text-text-primary">
                      {req.reporter?.first_name} {req.reporter?.last_name}
                    </p>
                  </div>
                </div>

                {req.drop_off_photo_path && (
                  <DropoffPhoto path={req.drop_off_photo_path} onClick={(url) => setLightboxUrl(url)} />
                )}

                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-text-muted flex items-center gap-1">
                    <Clock size={10} />
                    {timeAgo(req.created_at)}
                  </span>

                  {req.status === 'pending' && (
                    <button
                      onClick={() => setSelected(req)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
                    >
                      <CheckCircle2 size={13} />
                      Mark as received
                    </button>
                  )}

                  {req.status === 'received' && (
                    <button
                      onClick={() => setPickupRequest(req)}
                      disabled={actioning}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-open-text text-white text-xs font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
                    >
                      <User size={13} />
                      Verify & confirm pickup
                    </button>
                  )}

                  {req.status === 'resolved' && (
                    <span className="flex items-center gap-1 text-xs text-status-open-text font-medium">
                      <CheckCircle2 size={13} />
                      Completed
                    </span>
                  )}
                </div>
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}

function DropoffPhoto({ path, onClick }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    const { data: { publicUrl } } = supabase.storage.from('report-photos').getPublicUrl(path)
    setUrl(publicUrl)
  }, [path])

  if (!url) return null

  return (
    <button
      onClick={() => onClick(url)}
      className="flex items-center gap-3 w-full mb-3 bg-surface-muted rounded-xl px-3 py-2 border border-border hover:border-brand-400 transition-colors group"
    >
      <img
        src={url}
        alt="Drop-off proof"
        className="w-12 h-12 object-cover rounded-lg shrink-0 border border-border"
      />
      <div className="flex flex-col items-start min-w-0">
        <p className="text-xs font-medium text-text-primary">Drop-off photo</p>
        <p className="text-[10px] text-text-muted group-hover:text-brand-600 transition-colors">Tap to view full size</p>
      </div>
    </button>
  )
}