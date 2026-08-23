import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { PackageCheck, Clock, CheckCircle2, ImagePlus, ArrowLeft, X } from 'lucide-react'
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

export default function DropoffRequestsPage() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [selected, setSelected] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [actioning, setActioning] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    fetchRequests()

    const channel = supabase
      .channel('dropoff-admin')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'dropoff_requests',
      }, () => fetchRequests())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [filter])

  async function fetchRequests() {
    setLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/dropoff?status=${filter}`, {
        headers: {
          'apikey': ANON_KEY,
          'Content-Type': 'application/json',
        }
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
      const ext = photo.name.split('.').pop()
      const path = `dropoff/${selected.id}/${Date.now()}.${ext}`
      await supabase.storage.from('report-photos').upload(path, photo)

      await fetch(`${SERVER_URL}/dropoff/${selected.id}/receive`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
        },
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

  async function handlePickup(requestId) {
    setActioning(true)
    try {
      await fetch(`${SERVER_URL}/dropoff/${requestId}/pickup`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
        },
      })
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
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white"
            onClick={() => setLightboxUrl(null)}
          >
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

            <div className="bg-surface-muted rounded-xl p-3 mb-4">
              <p className="text-xs font-semibold text-text-primary">
                {selected.reports?.title ?? 'Unknown item'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Dropped off by {selected.claimant?.first_name} {selected.claimant?.last_name} · {selected.claimant?.student_id}
              </p>
              <p className="text-xs text-text-muted">
                Owner: {selected.reporter?.first_name} {selected.reporter?.last_name} · {selected.reporter?.student_id}
              </p>
            </div>

            <p className="text-xs text-text-secondary mb-3">
              Take a photo of the item as proof that it has been received at the ISSC office.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />

            {photoPreview ? (
              <div className="relative mb-4">
                <img
                  src={photoPreview}
                  alt=""
                  className="w-full h-40 object-cover rounded-xl border border-border"
                />
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
              filter === s
                ? 'bg-brand-600 text-white'
                : 'bg-surface-muted text-text-secondary hover:bg-surface-card'
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
                    <p className="text-xs text-text-muted mt-0.5">
                      {req.reports?.category ?? '—'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${statusStyle.bg} ${statusStyle.text}`}>
                    {statusStyle.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-surface-muted rounded-xl px-3 py-2">
                    <p className="text-[10px] text-text-muted mb-0.5">Finder</p>
                    <p className="text-xs font-medium text-text-primary">
                      {req.claimant?.first_name} {req.claimant?.last_name}
                    </p>
                    <p className="text-[10px] text-text-muted">{req.claimant?.student_id}</p>
                  </div>
                  <div className="bg-surface-muted rounded-xl px-3 py-2">
                    <p className="text-[10px] text-text-muted mb-0.5">Owner</p>
                    <p className="text-xs font-medium text-text-primary">
                      {req.reporter?.first_name} {req.reporter?.last_name}
                    </p>
                    <p className="text-[10px] text-text-muted">{req.reporter?.student_id}</p>
                  </div>
                </div>

                {/* Drop-off photo */}
                {req.drop_off_photo_path && (
                  <DropoffPhoto
                    path={req.drop_off_photo_path}
                    onClick={(url) => setLightboxUrl(url)}
                  />
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
                      onClick={() => handlePickup(req.id)}
                      disabled={actioning}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-open-text text-white text-xs font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
                    >
                      <PackageCheck size={13} />
                      Confirm pickup
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
      className="w-full mb-3"
    >
      <img
        src={url}
        alt="Drop-off proof"
        className="w-full h-32 object-cover rounded-xl border border-border"
      />
    </button>
  )
}