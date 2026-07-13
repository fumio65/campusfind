import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, X, Camera } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const CATEGORIES = [
  'Electronics', 'IDs & Cards', 'Bags', 'Clothing',
  'Books & Notes', 'Keys', 'Wallet', 'Jewelry', 'Documents', 'Other',
]

export default function EditReportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('')
  const [existingPhotos, setExistingPhotos] = useState([])
  const [removedPhotoIds, setRemovedPhotoIds] = useState([])
  const [newPhotos, setNewPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchReport()
  }, [id])

  async function fetchReport() {
    const { data: report } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .eq('reporter_id', session.user.id)
      .single()

    if (!report) { navigate(-1); return }

    setTitle(report.title ?? '')
    setDescription(report.description ?? '')
    setLocation(report.location ?? '')
    setCategory(report.category ?? '')

    const { data: photos } = await supabase
      .from('report_photos')
      .select('id, storage_path')
      .eq('report_id', id)
      .order('position', { ascending: true })

    const withUrls = (photos ?? []).map((p) => {
      const { data: { publicUrl } } = supabase.storage
        .from('report-photos')
        .getPublicUrl(p.storage_path)
      return { ...p, url: publicUrl }
    })
    setExistingPhotos(withUrls)
    setLoading(false)
  }

  function handleNewPhoto(e) {
    const files = Array.from(e.target.files ?? [])
    const totalPhotos = existingPhotos.length - removedPhotoIds.length + newPhotos.length
    const allowed = 3 - totalPhotos
    const toAdd = files.slice(0, allowed).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setNewPhotos((prev) => [...prev, ...toAdd])
  }

  function removeExisting(photoId) {
    setRemovedPhotoIds((prev) => [...prev, photoId])
  }

  function removeNew(index) {
    setNewPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) return setError('Please give your item a title.')
    if (!description.trim()) return setError('Please describe the item.')
    if (!location.trim()) return setError('Please enter where you last had the item.')
    if (!category) return setError('Please select a category.')

    setSubmitting(true)
    try {
      // Update report
      await supabase.from('reports').update({
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        category,
      }).eq('id', id)

      // Delete removed photos
      for (const photoId of removedPhotoIds) {
        const photo = existingPhotos.find((p) => p.id === photoId)
        if (photo) {
          await supabase.storage.from('report-photos').remove([photo.storage_path])
          await supabase.from('report_photos').delete().eq('id', photoId)
        }
      }

      // Upload new photos
      const startPosition = existingPhotos.filter((p) => !removedPhotoIds.includes(p.id)).length
      for (let i = 0; i < newPhotos.length; i++) {
        const { file } = newPhotos[i]
        const ext = file.name.split('.').pop()
        const path = `${id}/${Date.now()}-${i}.${ext}`
        await supabase.storage.from('report-photos').upload(path, file)
        await supabase.from('report_photos').insert({
          report_id: id,
          storage_path: path,
          position: startPosition + i,
        })
      }

      navigate(`/reports/${id}`)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const totalPhotos = existingPhotos.filter((p) => !removedPhotoIds.includes(p.id)).length + newPhotos.length
  const canAddMore = totalPhotos < 3

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page safe-top flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-page safe-top pb-10">
      {/* Header */}
      <div className="bg-surface-card border-b border-border px-4 pt-12 pb-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-muted">
          <ArrowLeft size={20} className="text-text-primary" />
        </button>
        <h1 className="text-base font-bold text-text-primary flex-1">Edit report</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-5 flex flex-col gap-5">

        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            Item name <span className="text-status-rejected-text">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Blue umbrella"
            className="w-full h-11 px-3 text-sm rounded-xl border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            Description <span className="text-status-rejected-text">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Color, brand, size, or any identifying details…"
            rows={3}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
          />
        </div>

        {/* Location */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1">
            Last known location or area <span className="text-status-rejected-text">*</span>
          </label>
          <p className="text-[11px] text-text-muted mb-1.5">
            If unsure, describe the general area — e.g. "Near the cafeteria" or "Somewhere in the library".
          </p>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. CICT Building, Room 201"
            className="w-full h-11 px-3 text-sm rounded-xl border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            Category <span className="text-status-rejected-text">*</span>
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
                    : 'border-border-strong text-text-secondary hover:border-brand-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1.5">
            Photos <span className="text-text-muted font-normal">(max 3)</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {existingPhotos.filter((p) => !removedPhotoIds.includes(p.id)).map((p) => (
              <div key={p.id} className="relative">
                <img src={p.url} alt="" className="w-20 h-20 rounded-xl object-cover border border-border" />
                <button
                  type="button"
                  onClick={() => removeExisting(p.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-status-rejected-text text-white flex items-center justify-center"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {newPhotos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p.preview} alt="" className="w-20 h-20 rounded-xl object-cover border border-border" />
                <button
                  type="button"
                  onClick={() => removeNew(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-status-rejected-text text-white flex items-center justify-center"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {canAddMore && (
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border-strong flex flex-col items-center justify-center cursor-pointer hover:border-brand-400 transition-colors">
                <Camera size={18} className="text-text-muted mb-1" />
                <span className="text-[10px] text-text-muted">Add photo</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleNewPhoto} />
              </label>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs text-status-rejected-text bg-status-rejected-bg rounded-xl px-3 py-2.5">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}