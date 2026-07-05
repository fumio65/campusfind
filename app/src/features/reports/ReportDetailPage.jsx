import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MapPin, Clock, User, MessageSquare, Lightbulb, AlertCircle } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const STATUS_STYLES = {
  open: 'bg-status-open-bg text-status-open-text',
  claimed: 'bg-status-claimed-bg text-status-claimed-text',
  approved: 'bg-status-approved-bg text-status-approved-text',
  resolved: 'bg-status-resolved-bg text-status-resolved-text',
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ReportDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [report, setReport] = useState(null)
  const [reporter, setReporter] = useState(null)
  const [tips, setTips] = useState([])
  const [tipText, setTipText] = useState('')
  const [submittingTip, setSubmittingTip] = useState(false)
  const [tipError, setTipError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchReport()
  }, [id])

  async function fetchReport() {
    setLoading(true)
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      setError('Report not found.')
      setLoading(false)
      return
    }

    setReport(data)

    if (data.reporter_id) {
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', data.reporter_id)
        .single()
      setReporter(user)
    }

    const { data: tipsData } = await supabase
      .from('tips')
      .select('id, text, created_at, user_id')
      .eq('report_id', id)
      .order('created_at', { ascending: true })
    setTips(tipsData ?? [])

    setLoading(false)
  }

  async function handleTipSubmit(e) {
    e.preventDefault()
    if (!tipText.trim()) return
    if (tips.length >= 25) return setTipError('This report has reached the 25-tip limit.')

    setSubmittingTip(true)
    setTipError(null)

    const { error } = await supabase
      .from('tips')
      .insert({
        report_id: id,
        user_id: session.user.id,
        text: tipText.trim(),
      })

    if (error) {
      setTipError(error.message)
    } else {
      setTipText('')
      fetchReport()
    }
    setSubmittingTip(false)
  }

  const isOwner = report?.reporter_id === session?.user.id
  const isOpen = report?.status === 'open'
  const isClaimed = report?.status === 'claimed'

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page safe-top">
        <div className="bg-surface-card border-b border-border px-4 pt-12 pb-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center">
            <ArrowLeft size={20} />
          </button>
        </div>
        <div className="px-4 py-5 flex flex-col gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-surface-card rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-6">
        <AlertCircle size={32} className="text-text-muted mb-3" />
        <p className="text-sm text-text-secondary">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-brand-600 font-medium">Go back</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-page safe-top safe-bottom">
      <div className="bg-surface-card border-b border-border px-4 pt-12 pb-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-muted transition-colors"
        >
          <ArrowLeft size={20} className="text-text-primary" />
        </button>
        <h1 className="text-base font-bold text-text-primary flex-1 truncate">{report.title}</h1>
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[report.status] ?? ''}`}>
          {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
        </span>
      </div>

      <div className="px-4 py-5 flex flex-col gap-4 pb-10">
        {report.photos?.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 overflow-x-auto pb-1">
            {report.photos.map((url, i) => (
              <img key={i} src={url} alt="" className="w-32 h-32 rounded-xl object-cover shrink-0 border border-border" />
            ))}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-card rounded-2xl border border-border p-4 flex flex-col gap-3"
        >
          {report.description && (
            <p className="text-sm text-text-secondary leading-relaxed">{report.description}</p>
          )}
          <div className="flex flex-col gap-2 text-xs text-text-muted">
            {report.location && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-brand-600 shrink-0" /> {report.location}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="shrink-0" /> Filed {timeAgo(report.created_at)}
            </span>
            {reporter && (
              <span className="flex items-center gap-1.5">
                <User size={13} className="shrink-0" /> {reporter.first_name} {reporter.last_name}
              </span>
            )}
            {report.category && (
              <span className="inline-flex">
                <span className="bg-surface-muted text-text-secondary px-2 py-0.5 rounded-full text-[11px]">
                  {report.category}
                </span>
              </span>
            )}
          </div>
        </motion.div>

        {!isOwner && isOpen && (
          <Link
            to={`/reports/${id}/claim`}
            className="w-full h-12 rounded-xl bg-brand-600 text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <MessageSquare size={16} /> I found this item
          </Link>
        )}

        {isClaimed && !isOwner && (
          <div className="bg-status-claimed-bg border border-status-claimed-text/20 rounded-xl px-4 py-3 text-xs text-status-claimed-text">
            This item already has an active claim. You can leave a tip below if you have information.
          </div>
        )}

        <div className="bg-surface-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <Lightbulb size={15} className="text-status-claimed-text" /> Tips & sightings
            </h2>
            <span className="text-[11px] text-text-muted">{tips.length}/25</span>
          </div>

          {tips.length === 0 && (
            <p className="text-xs text-text-muted mb-3">No tips yet. If you've seen this item, leave a note below.</p>
          )}

          {tips.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {tips.map((tip) => (
                <div key={tip.id} className="bg-surface-muted rounded-xl px-3 py-2.5">
                  <p className="text-xs text-text-primary">{tip.text}</p>
                  <p className="text-[10px] text-text-muted mt-1">{timeAgo(tip.created_at)}</p>
                </div>
              ))}
            </div>
          )}

          {tips.length < 25 && (
            <form onSubmit={handleTipSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Share a sighting or lead…"
                value={tipText}
                onChange={(e) => setTipText(e.target.value)}
                maxLength={200}
                className="flex-1 h-10 px-3 text-xs rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
              />
              <button
                type="submit"
                disabled={submittingTip || !tipText.trim()}
                className="h-10 px-4 rounded-xl bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                Send
              </button>
            </form>
          )}

          {tipError && <p className="text-[11px] text-status-rejected-text mt-2">{tipError}</p>}
        </div>
      </div>
    </div>
  )
}