import { useState } from 'react'
import { Camera, X, CheckCircle2, Package, AlertCircle } from 'lucide-react'
import { supabase } from '../../shared/lib/supabaseClient'
import { useAuth } from '../../shared/lib/AuthContext'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

const CATEGORIES = [
  'Electronics', 'IDs & Cards', 'Bags', 'Clothing',
  'Books & Notes', 'Keys', 'Wallet', 'Jewelry', 'Documents', 'Other',
]

export default function WalkInIntakePage() {
  const { session } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [finderStudentId, setFinderStudentId] = useState('')
  const [finderValidation, setFinderValidation] = useState(null) // null | 'valid' | 'invalid'
  const [finderName, setFinderName] = useState('')
  const [validatingFinder, setValidatingFinder] = useState(false)
  const [photos, setPhotos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [createdReport, setCreatedReport] = useState(null)

  async function validateFinder(studentId) {
    if (!studentId.trim()) { setFinderValidation(null); setFinderName(''); return }
    setValidatingFinder(true)
    try {
      const res = await fetch(`${SERVER_URL}/accounts?search=${encodeURIComponent(studentId.trim())}&limit=5`)
      const body = await res.json()
      const exact = (body.accounts ?? []).find(
        (a) => a.student_id === studentId.trim().toUpperCase()
      )
      if (exact) {
        setFinderValidation('valid')
        setFinderName(`${exact.first_name} ${exact.last_name}`)
      } else {
        setFinderValidation('invalid')
        setFinderName('')
      }
    } catch {
      setFinderValidation(null)
    } finally {
      setValidatingFinder(false)
    }
  }

  function handleFinderIdChange(value) {
    setFinderStudentId(value)
    setFinderValidation(null)
    setFinderName('')
    clearTimeout(window._finderDebounce)
    if (!value.trim()) return
    window._finderDebounce = setTimeout(() => validateFinder(value), 600)
  }

  function handlePhoto(e) {
    const files = Array.from(e.target.files ?? [])
    const allowed = 3 - photos.length
    const toAdd = files.slice(0, allowed).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setPhotos((prev) => [...prev, ...toAdd])
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function reset() {
    setTitle('')
    setDescription('')
    setCategory('')
    setFinderStudentId('')
    setFinderValidation(null)
    setFinderName('')
    setPhotos([])
    setError(null)
    setCreatedReport(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) return setError('Please enter the item name.')
    if (!description.trim()) return setError('Please describe the item.')
    if (!category) return setError('Please select a category.')
    if (!finderStudentId.trim()) return setError("Please enter the finder's Student ID.")
    if (finderValidation !== 'valid') return setError("Finder's Student ID not found. Please verify.")

    setSubmitting(true)
    try {
      // 1. Create report
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
          type: 'found_walkin',
          title: title.trim(),
          description: description.trim(),
          category,
          location: 'ISSC Office',
          walkin_finder_ref: finderStudentId.trim().toUpperCase(),
          reporter_id: session.user.id,
          status: 'open',
        })
        .select()
        .single()

      if (reportError) throw reportError

      // 2. Upload photos
      for (let i = 0; i < photos.length; i++) {
        const { file } = photos[i]
        const ext = file.name.split('.').pop()
        const path = `reports/${report.id}/${Date.now()}-${i}.${ext}`
        const { error: uploadError } = await supabase.storage.from('report-photos').upload(path, file)
        if (!uploadError) {
          await supabase.from('report_photos').insert({
            report_id: report.id,
            storage_path: path,
            position: i,
          })
        }
      }

      // 3. Credit finder +5 trust score
      await fetch(`${SERVER_URL}/reports/${report.id}/credit-finder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finderStudentId: finderStudentId.trim().toUpperCase() }),
      })

      // 4. Notify all students
      await fetch(`${SERVER_URL}/reports/${report.id}/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: session.user.id,
          title: report.title,
          location: 'ISSC Office',
          category: report.category,
        }),
      }).catch(() => {})

      setCreatedReport(report)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (createdReport) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-surface-card border border-border rounded-2xl p-8 max-w-md w-full flex flex-col items-center text-center gap-5 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-status-open-bg flex items-center justify-center">
            <CheckCircle2 size={32} className="text-status-open-text" />
          </div>
          <div>
            <p className="text-lg font-bold text-text-primary mb-1">Item registered successfully</p>
            <p className="text-sm text-text-secondary">
              <span className="font-semibold">"{createdReport.title}"</span> has been added to the system.
              All students have been notified.
            </p>
          </div>
          <div className="w-full bg-surface-muted rounded-xl px-4 py-3 text-left space-y-1.5">
            {[
              { label: 'Category', value: createdReport.category },
              { label: 'Location', value: 'ISSC Office' },
              { label: 'Finder', value: `${finderName} (${finderStudentId.toUpperCase()})` },
              { label: 'Trust score', value: '+5 awarded to finder' },
              { label: 'Status', value: 'Open — awaiting owner claim' },
            ].map(({ label, value }) => (
              <p key={label} className="text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">{label}:</span> {value}
              </p>
            ))}
          </div>
          <button
            onClick={reset}
            className="w-full h-10 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            Register another drop-off
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-full bg-status-claimed-bg flex items-center justify-center shrink-0">
          <Package size={18} className="text-status-claimed-text" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Found Item Drop-off</h2>
          <p className="text-xs text-text-muted mt-0.5">Register an item dropped off at the ISSC office by a finder</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-6">

          {/* Left — Item details */}
          <div className="flex flex-col gap-4">
            <div className="bg-surface-card border border-border rounded-xl p-5 flex flex-col gap-4">
              <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">Item details</p>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Item name <span className="text-status-rejected-text">*</span>
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Black leather wallet"
                  className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Description <span className="text-status-rejected-text">*</span>
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Color, brand, distinguishing features…"
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
                      onClick={() => setCategory(cat === category ? '' : cat)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
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

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1.5">
                  Photos <span className="text-text-muted font-normal">(optional, max 3)</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {photos.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p.preview} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-status-rejected-text text-white flex items-center justify-center"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {photos.length < 3 && (
                    <label className="w-16 h-16 border-2 border-dashed border-border-strong rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-brand-400 transition-colors">
                      <Camera size={16} className="text-text-muted mb-0.5" />
                      <span className="text-[10px] text-text-muted">Add</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right — Finder info + actions */}
          <div className="flex flex-col gap-4">
            <div className="bg-surface-card border border-border rounded-xl p-5 flex flex-col gap-4">
              <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">Finder information</p>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  Finder's Student ID <span className="text-status-rejected-text">*</span>
                </label>
                <div className="relative">
                  <input
                    value={finderStudentId}
                    onChange={(e) => handleFinderIdChange(e.target.value)}
                    placeholder="e.g. 24-00301"
                    className={`w-full h-9 px-3 text-sm rounded-md border bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                      finderValidation === 'invalid'
                        ? 'border-status-rejected-text'
                        : finderValidation === 'valid'
                          ? 'border-status-open-text'
                          : 'border-border-strong'
                    }`}
                  />
                  {validatingFinder && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">Checking…</span>
                  )}
                </div>
                {finderValidation === 'valid' && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-status-open-text">
                    <CheckCircle2 size={12} />
                    <span className="font-medium">{finderName}</span>
                    <span className="text-status-open-text/70">— will receive +5 trust score</span>
                  </div>
                )}
                {finderValidation === 'invalid' && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-status-rejected-text">
                    <AlertCircle size={12} />
                    Student ID not found in the system.
                  </div>
                )}
                <p className="text-[11px] text-text-muted mt-1">For internal records. Finder earns +5 trust score immediately.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">Pickup location</label>
                <input
                  value="ISSC Office"
                  disabled
                  className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-muted text-text-muted"
                />
              </div>
            </div>

            <div className="bg-surface-muted border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-text-secondary mb-2">What happens next?</p>
              <ul className="text-xs text-text-muted space-y-1">
                <li>• Item appears on the app for students to browse</li>
                <li>• All students receive an Activity notification</li>
                <li>• Finder receives +5 trust score immediately</li>
                <li>• Owner submits a claim via the app</li>
                <li>• Owner comes in person with their ID to collect</li>
              </ul>
            </div>

            {error && (
              <p className="text-xs text-status-rejected-text bg-status-rejected-bg rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="px-4 h-9 rounded-lg border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={submitting || finderValidation !== 'valid'}
                className="flex-1 h-9 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Registering…' : 'Register item drop-off'}
              </button>
            </div>
          </div>

        </div>
      </form>
    </div>
  )
}