import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Camera, X, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const MAX_PHOTOS = 3

export default function ClaimPage() {
  const { id: reportId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [message, setMessage] = useState('')
  const [photos, setPhotos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const fileInputRef = useRef(null)

  function handlePhotoChange(e) {
    const files = Array.from(e.target.files ?? [])
    const remaining = MAX_PHOTOS - photos.length
    const toAdd = files.slice(0, remaining).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setPhotos((prev) => [...prev, ...toAdd])
    e.target.value = ''
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (photos.length === 0) {
      return setError('At least one photo is required as proof that you found this item.')
    }
    if (!message.trim()) {
      return setError('Please describe how you found the item and where it is now.')
    }

    setSubmitting(true)

    try {
      // 1. Create the claim
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .insert({
          report_id: reportId,
          claimant_id: session.user.id,
          status: 'pending',
        })
        .select()
        .single()

      if (claimError) throw claimError

      // 2. Upload photos and insert into claim_photos table (mandatory per FR-4)
      let position = 0
      for (const photo of photos) {
        const ext = photo.file.name.split('.').pop()
        const path = `claims/${claim.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('report-photos')
          .upload(path, photo.file, { cacheControl: '3600', upsert: false })
        if (!uploadError) {
          await supabase
            .from('claim_photos')
            .insert({ claim_id: claim.id, storage_path: path, position })
          position++
        }
      }

      // 3. Update the report status to 'claimed'
      await supabase
        .from('reports')
        .update({ status: 'claimed' })
        .eq('id', reportId)

      // 4. Send an initial message in the claim thread
      await supabase
        .from('claim_messages')
        .insert({
          claim_id: claim.id,
          sender_id: session.user.id,
          sender_role: 'claimant',
          body: message.trim(),
        })

      setDone(true)

      // Notify reporter via server
      await fetch(`${import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, claimantId: session.user.id }),
      })

      setTimeout(() => navigate(`/reports/${reportId}`), 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-surface-page">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-16 h-16 rounded-full bg-status-open-bg flex items-center justify-center"
        >
          <CheckCircle2 size={32} className="text-status-open-text" />
        </motion.div>
        <p className="text-sm font-semibold text-text-primary">Claim submitted!</p>
        <p className="text-xs text-text-muted">Waiting for the reporter to review.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-page safe-top safe-bottom">
      {/* Header */}
      <div className="bg-surface-card border-b border-border px-4 pt-12 pb-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-muted transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-text-primary" />
        </button>
        <h1 className="text-base font-bold text-text-primary">Submit a claim</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-5 flex flex-col gap-5 pb-10">

        {/* Info banner */}
        <div className="flex items-start gap-2.5 bg-status-approved-bg text-status-approved-text text-xs rounded-xl px-3 py-3">
          <Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Only one claim can be active at a time. The reporter will review your photos and
            message before approving. Be honest and specific.
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-status-rejected-bg text-status-rejected-text text-xs rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Photo proof — mandatory */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1">
            Photo proof <span className="text-status-rejected-text">*</span>
          </label>
          <p className="text-[11px] text-text-muted mb-2">
            Upload a photo of the item you found. This is required to submit a claim.
          </p>
          <div className="flex gap-3 flex-wrap">
            {photos.map((photo, i) => (
              <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border">
                <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                  aria-label="Remove photo"
                >
                  <X size={11} className="text-white" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-24 h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                  photos.length === 0
                    ? 'border-status-rejected-text/40 text-status-rejected-text bg-status-rejected-bg/30'
                    : 'border-border-strong text-text-muted'
                } hover:border-brand-400`}
              >
                <Camera size={20} />
                <span className="text-[10px]">
                  {photos.length === 0 ? 'Required' : 'Add more'}
                </span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoChange}
            className="hidden"
          />
        </div>

        {/* Message */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            How did you find it? <span className="text-status-rejected-text">*</span>
          </label>
          <textarea
            placeholder="Describe where you found it, when, and where it is now…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={400}
            className="w-full px-4 py-3 text-sm rounded-xl border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted resize-none"
          />
          <p className="text-[11px] text-text-muted text-right mt-1">{message.length}/400</p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-60 active:opacity-80 transition-opacity"
        >
          {submitting ? 'Submitting claim…' : 'Submit claim'}
        </button>
      </form>
    </div>
  )
}