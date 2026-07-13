import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Camera, X, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const MAX_PHOTOS = 3

const CATEGORIES = [
  'Electronics', 'IDs & Cards', 'Bags', 'Clothing',
  'Books & Notes', 'Keys', 'Wallet', 'Jewelry', 'Documents', 'Other',
]

export default function NewReportPage() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('')
  const [photos, setPhotos] = useState([]) // { file, preview }
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

    if (!title.trim()) return setError('Please give your item a title so others know what to look for.')
    if (!description.trim()) return setError('Please describe the item — color, brand, or any details that help identify it.')
    if (!location.trim()) return setError('Please enter where you last had the item.')
    if (!category) return setError('Please select a category to help others find your report.')

    setSubmitting(true)

    try {
      // 1. Insert the report
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim(),
          category: category || null,
          type: 'lost',
          status: 'open',
          reporter_id: session.user.id,
        })
        .select()
        .single()

      if (reportError) throw reportError

      // 2. Upload photos if any
      // 2. Upload photos to storage and insert into report_photos table
      if (photos.length > 0) {
        let position = 0
        for (const photo of photos) {
          const ext = photo.file.name.split('.').pop()
          const path = `reports/${report.id}/${Date.now()}.${ext}`
          const { error: uploadError } = await supabase.storage
            .from('report-photos')
            .upload(path, photo.file, { cacheControl: '3600', upsert: false })
          if (!uploadError) {
            await supabase
              .from('report_photos')
              .insert({ report_id: report.id, storage_path: path, position })
            position++
          }
        }
      }

      setDone(true)

      // Notify all users about the new report
      fetch(`${import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'}/reports/${report.id}/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: session.user.id,
          title: report.title,
          location: report.location,
          category: report.category,
        }),
      }).catch(() => {}) // fire and forget

      setTimeout(() => navigate(`/reports/${report.id}`), 1200)
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
        <p className="text-sm font-semibold text-text-primary">Report filed!</p>
        <p className="text-xs text-text-muted">Redirecting…</p>
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
        <h1 className="text-base font-bold text-text-primary">Report a lost item</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-5 flex flex-col gap-5 pb-10">
        {error && (
          <div className="flex items-start gap-2 bg-status-rejected-bg text-status-rejected-text text-xs rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            What did you lose? <span className="text-status-rejected-text">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Black Samsung phone"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            required
            className="w-full h-11 px-4 text-sm rounded-xl border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            Category
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat === category ? '' : cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors active:scale-95 ${
                  category === cat
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-surface-card text-text-secondary border-border-strong'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1">
            Last known location or area <span className="text-status-rejected-text">*</span>
          </label>
          <p className="text-[11px] text-text-muted mb-1.5">
            If unsure, describe the general area — e.g. "Near the cafeteria" or "Somewhere in the library".
          </p>
          <div className="relative">
            <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="e.g. Library 2nd floor or Near the cafeteria"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full h-11 pl-10 pr-4 text-sm rounded-xl border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            Description <span className="text-status-rejected-text">*</span>
          </label>
          <textarea
            placeholder="Color, brand, distinguishing features, when you last had it…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full px-4 py-3 text-sm rounded-xl border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted resize-none"
          />
          <p className="text-[11px] text-text-muted text-right mt-1">{description.length}/500</p>
        </div>

        {/* Photos */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            Photos <span className="text-text-muted font-normal">(optional, up to {MAX_PHOTOS})</span>
          </label>
          <div className="flex gap-3 flex-wrap">
            {photos.map((photo, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
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
                className="w-20 h-20 rounded-xl border-2 border-dashed border-border-strong flex flex-col items-center justify-center gap-1 text-text-muted hover:border-brand-400 transition-colors"
              >
                <Camera size={18} />
                <span className="text-[10px]">Add photo</span>
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

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-60 active:opacity-80 transition-opacity mt-2"
        >
          {submitting ? 'Filing report…' : 'File report'}
        </button>
      </form>
    </div>
  )
}