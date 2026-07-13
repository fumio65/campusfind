import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, MapPin, Clock, User, MessageSquare,
  Lightbulb, AlertCircle, CheckCircle2, XCircle, Star, X, CornerUpLeft,
  Pencil, Trash2
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import MessageThread from '../claims/MessageThread'
import ProxyRequestForm from './ProxyRequestForm'
import ConfirmationRequestBanner from './ConfirmationRequestBanner'
import TrustScoreDialog from '../../shared/components/TrustScoreDialog'

function TipCard({ tip, isOwn, onReply, isReply, onCredit, credited }) {
  const name = tip.users
    ? `${tip.users.first_name} ${tip.users.last_name}`
    : 'Anonymous'
  const firstName = tip.users?.first_name ?? '?'
  const lastName = tip.users?.last_name ?? ''
  const initials = `${firstName[0]}${lastName[0] ?? ''}`.toUpperCase()
  const trustScore = tip.users?.trust_score ?? 100

  return (
    <div className={isReply ? 'pl-4 border-l-2 border-brand-200 ml-1' : ''}>
      <div className={`rounded-xl p-3 ${
        credited
          ? 'bg-status-open-bg border border-status-open-text/20'
          : isOwn
            ? 'bg-brand-50 border border-brand-100'
            : isReply
              ? 'bg-white border border-border'
              : 'bg-surface-muted'
      }`}>
        <div className="flex items-start gap-2.5">
          {/* Avatar */}
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
            isOwn ? 'bg-brand-600 text-white' : 'bg-border-strong text-text-secondary'
          }`}>
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] font-semibold text-text-primary">{name}</p>
                <span className="flex items-center gap-0.5 text-[10px] text-status-open-text">
                  <Star size={9} />
                  {trustScore}
                </span>
                {isOwn && (
                  <span className="text-[10px] text-brand-600 font-medium">· You</span>
                )}
                {credited && (
                  <span className="flex items-center gap-0.5 text-[10px] text-status-open-text font-medium">
                    <CheckCircle2 size={9} /> Helped recovery
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onCredit && !credited && (
                  <button
                    type="button"
                    onClick={onCredit}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-600 text-white text-[10px] font-semibold hover:bg-brand-700 transition-colors"
                  >
                    <CheckCircle2 size={10} />
                    Mark as helpful
                  </button>
                )}
                {!isReply && !credited && (
                  <button
                    type="button"
                    onClick={onReply}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border-strong bg-surface-page text-[10px] font-semibold text-text-secondary hover:border-brand-400 hover:text-brand-600 transition-colors"
                  >
                    <CornerUpLeft size={10} />
                    Reply
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-text-primary leading-relaxed">{tip.text}</p>
            <p className="text-[10px] text-text-muted mt-1">{timeAgo(tip.created_at)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const STATUS_STYLES = {
  open: 'bg-status-open-bg text-status-open-text',
  claimed: 'bg-status-claimed-bg text-status-claimed-text',
  approved: 'bg-status-approved-bg text-status-approved-text',
  resolved: 'bg-status-resolved-bg text-status-resolved-text',
}

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

export default function ReportDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [report, setReport] = useState(null)
  const [reporter, setReporter] = useState(null)
  const [claim, setClaim] = useState(null)
  const [claimant, setClaimant] = useState(null)
  const [tips, setTips] = useState([])
  const [tipText, setTipText] = useState('')
  const [parentTipId, setParentTipId] = useState(null)
  const [submittingTip, setSubmittingTip] = useState(false)
  const [tipError, setTipError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actioning, setActioning] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [trustToast, setTrustToast] = useState({ visible: false, delta: 0, newScore: 100 })
  const [creditedTipId, setCreditedTipId] = useState(null)
  const [pendingCreditTip, setPendingCreditTip] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // Track previous trust score to calculate actual delta
  const claimantIdRef = useRef(null)
  const prevScoreRef = useRef(null)

  // Keep claimantIdRef in sync with claim state to avoid stale closures
  useEffect(() => {
    claimantIdRef.current = claim?.claimant_id ?? null
  }, [claim])

  async function showTrustToast(expectedDelta, reason = '') {
    // Wait for all server updates to complete (including repeat penalty)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const { data } = await supabase
      .from('users')
      .select('trust_score')
      .eq('id', session.user.id)
      .single()
    const newScore = data?.trust_score ?? 100
    const actualDelta = prevScoreRef.current !== null
      ? newScore - prevScoreRef.current
      : expectedDelta
    prevScoreRef.current = newScore
    setTrustToast({ visible: true, delta: actualDelta, newScore, reason })
  }

  // Snapshot trust score before actions
  async function snapshotScore() {
    const { data } = await supabase
      .from('users')
      .select('trust_score')
      .eq('id', session.user.id)
      .single()
    prevScoreRef.current = data?.trust_score ?? 100
  }

  useEffect(() => {
    fetchAll()

    const channelName = `report-detail-${id}`

    // Remove any existing channel with this name before creating a new one
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'reports', filter: `id=eq.${id}`
      }, async (payload) => {
        const newStatus = payload.new?.status
        if (newStatus === 'resolved' && claimantIdRef.current === session?.user?.id) {
          await showTrustToast(5, 'The item was recovered. Thank you for your honesty!')
        }
        fetchAll()
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'user_notifications',
        filter: `user_id=eq.${session?.user?.id}`
      }, async (payload) => {
        if (payload.new?.type === 'tip_credited') {
          // Shorter delay for tip credit — only one server update, no repeat penalty
          await new Promise((r) => setTimeout(r, 500))
          const { data } = await supabase
            .from('users')
            .select('trust_score')
            .eq('id', session.user.id)
            .single()
          const newScore = data?.trust_score ?? 100
          const actualDelta = prevScoreRef.current !== null ? newScore - prevScoreRef.current : 2
          prevScoreRef.current = newScore
          setTrustToast({ visible: true, delta: actualDelta, newScore, reason: 'Your tip was credited for helping recover this item.' })
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'claims'
      }, (payload) => {
        if (payload.new?.report_id === id) fetchAll()
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'claims', filter: `report_id=eq.${id}`
      }, async (payload) => {
        const newStatus = payload.new?.status
        const claimantId = payload.new?.claimant_id
        fetchAll()
        if (claimantId === session?.user?.id || claimantIdRef.current === session?.user?.id) {
          if (newStatus === 'rejected') {
            await showTrustToast(-5, 'Your claim was declined by the reporter.')
          }
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [id])

  async function fetchAll() {
    setLoading(true)
    setClaim(null)
    setClaimant(null)

    // Snapshot current trust score for delta calculation
    if (session?.user?.id && prevScoreRef.current === null) {
      const { data: userData } = await supabase
        .from('users')
        .select('trust_score')
        .eq('id', session.user.id)
        .single()
      prevScoreRef.current = userData?.trust_score ?? 100
    }

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

    // Fetch report photos from report_photos table
    const { data: reportPhotos } = await supabase
      .from('report_photos')
      .select('storage_path')
      .eq('report_id', id)
      .order('position', { ascending: true })
    const photoUrls = (reportPhotos ?? []).map((p) => {
      const { data: { publicUrl } } = supabase.storage
        .from('report-photos')
        .getPublicUrl(p.storage_path)
      return publicUrl
    })
    setReport({ ...data, photoUrls })

    // Fetch reporter name
    if (data.reporter_id) {
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', data.reporter_id)
        .single()
      setReporter(user)
    }

    // Fetch active claim
    let activeClaim = null
    if (data.status === 'claimed' || data.status === 'approved') {
      const { data: claimData } = await supabase
        .from('claims')
        .select('*')
        .eq('report_id', id)
        .in('status', ['pending', 'approved'])
        .single()

      if (claimData) {
        activeClaim = claimData
        setClaim(claimData)

        const { data: claimPhotos } = await supabase
          .from('claim_photos')
          .select('storage_path')
          .eq('claim_id', claimData.id)
          .order('position', { ascending: true })
        const photoUrls = (claimPhotos ?? []).map((p) => {
          const { data: { publicUrl } } = supabase.storage
            .from('report-photos')
            .getPublicUrl(p.storage_path)
          return publicUrl
        })

        const { data: msgs } = await supabase
          .from('claim_messages')
          .select('body')
          .eq('claim_id', claimData.id)
        const dropOffChosen = (msgs ?? []).some((m) => m.body?.startsWith('📍'))
        setClaim({ ...claimData, photoUrls, drop_off_chosen: dropOffChosen })

        const { data: claimantData } = await supabase
          .from('users')
          .select('first_name, last_name, trust_score')
          .eq('id', claimData.claimant_id)
          .single()
        setClaimant(claimantData)
      }
    }

    // Always fetch the current user's rejected claim — needed for rejection banner
    if (session?.user?.id) {
      const { data: rejectedClaim } = await supabase
        .from('claims')
        .select('id, status, claimant_id')
        .eq('report_id', id)
        .eq('claimant_id', session.user.id)
        .eq('status', 'rejected')
        .maybeSingle()
      // Only set if no active claim was found (don't override pending/approved)
      if (rejectedClaim && !activeClaim) {
        setClaim(rejectedClaim)
      }
    }

    // Fetch tips
    const { data: tipsData } = await supabase
      .from('tips')
      .select('id, text, created_at, user_id, parent_tip_id, credited, users(first_name, last_name, trust_score)')
      .eq('report_id', id)
      .order('created_at', { ascending: true })
    setTips(tipsData ?? [])

    // Restore creditedTipId from DB so button doesn't reappear on refresh
    const credited = (tipsData ?? []).find((t) => t.credited)
    if (credited) setCreditedTipId(credited.id)

    setLoading(false)
  }

  async function handleClaimAction(action) {
    if (!claim) return
    setActioning(true)
    try {
      await fetch(`${import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'}/claims/${claim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    } catch (err) {
      console.error(err)
    }
    setActioning(false)
    fetchAll()
  }

  async function handleMarkResolved() {
    setActioning(true)
    try {
      await fetch(`${import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'}/reports/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedVia: 'handoff' }),
      })
    } catch (err) {
      console.error(err)
    }
    setActioning(false)
    fetchAll()
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      // 1. Get photos to delete from storage
      const { data: photos } = await supabase
        .from('report_photos')
        .select('storage_path')
        .eq('report_id', id)

      // 2. Delete claim messages first (FK constraint)
      const { data: claims } = await supabase
        .from('claims')
        .select('id')
        .eq('report_id', id)
      for (const claim of claims ?? []) {
        await supabase.from('claim_messages').delete().eq('claim_id', claim.id)
        await supabase.from('claim_photos').delete().eq('claim_id', claim.id)
      }

      // 3. Delete claims
      await supabase.from('claims').delete().eq('report_id', id)

      // 4. Delete tips
      await supabase.from('tips').delete().eq('report_id', id)

      // 5. Delete photos from storage
      if (photos?.length) {
        await supabase.storage.from('report-photos').remove(photos.map((p) => p.storage_path))
      }

      // 6. Delete report_photos records
      await supabase.from('report_photos').delete().eq('report_id', id)

      // 7. Delete the report
      const { error } = await supabase.from('reports').delete().eq('id', id)
      if (error) throw error

      navigate('/')
    } catch (err) {
      console.error('Delete error:', err)
      setDeleteError(err.message ?? 'Failed to delete report. Please try again.')
      setDeleting(false)
    }
  }

  async function handleCreditTip(tip) {
    setPendingCreditTip(tip)
  }

  async function confirmCreditTip(resolveReport = false) {
    const tip = pendingCreditTip
    if (!tip) return
    setPendingCreditTip(null)
    setCreditedTipId(tip.id)
    try {
      await fetch(`${import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'}/tips/${tip.id}/credit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: tip.user_id, reportId: id, resolveReport }),
      })
      if (resolveReport) fetchAll()
    } catch (err) {
      console.error(err)
      setCreditedTipId(null)
    }
  }

  async function handleTipSubmit(e) {
    e.preventDefault()
    if (!tipText.trim()) return
    if (tips.length >= 25) return setTipError('This report has reached the 25-tip limit.')
    setSubmittingTip(true)
    setTipError(null)
    const { error } = await supabase.from('tips').insert({
      report_id: id,
      user_id: session.user.id,
      text: tipText.trim(),
      parent_tip_id: parentTipId ?? null,
    })
    if (error) setTipError(error.message)
    else { setTipText(''); setParentTipId(null); fetchAll() }
    setSubmittingTip(false)
  }

  const isOwner = report?.reporter_id === session?.user.id
  const isOpen = report?.status === 'open'
  const isClaimed = report?.status === 'claimed'
  const isApproved = report?.status === 'approved'
  const isResolved = report?.status === 'resolved'

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
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full rounded-xl object-contain"
          />
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
          >
            <ArrowLeft size={18} className="rotate-[135deg]" />
          </button>
        </div>
      )}

      <TrustScoreDialog
        delta={trustToast.delta}
        newScore={trustToast.newScore}
        reason={trustToast.reason}
        visible={trustToast.visible}
        onDismiss={() => setTrustToast((t) => ({ ...t, visible: false }))}
      />

      {/* Credit tip confirmation dialog */}
      {pendingCreditTip && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
          >
            <div className="w-10 h-10 rounded-full bg-status-open-bg flex items-center justify-center mb-3">
              <CheckCircle2 size={20} className="text-status-open-text" />
            </div>
            <h3 className="text-sm font-bold text-text-primary mb-1">Mark tip as helpful?</h3>
            <p className="text-xs text-text-secondary mb-1">
              You're about to credit this tip from <span className="font-semibold">{pendingCreditTip.users?.first_name} {pendingCreditTip.users?.last_name}</span>:
            </p>
            <p className="text-xs text-text-primary bg-surface-muted rounded-xl px-3 py-2 mb-4 italic">
              "{pendingCreditTip.text}"
            </p>
            <p className="text-xs text-text-muted mb-4">
              This will award them <span className="font-semibold text-status-open-text">+2 trust score</span> and mark this report as resolved. This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmCreditTip(true)}
                className="w-full h-10 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
              >
                Yes, this tip helped — mark resolved
              </button>
              <button
                onClick={() => setPendingCreditTip(null)}
                className="w-full h-10 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
          >
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-status-rejected-bg flex items-center justify-center mb-3">
                <Trash2 size={22} className="text-status-rejected-text" />
              </div>
              <h3 className="text-sm font-bold text-text-primary mb-1">Delete this report?</h3>
              <p className="text-xs text-text-secondary">
                This will permanently remove the report and all its tips and photos. This cannot be undone.
              </p>
            </div>
            {deleteError && (
              <p className="text-xs text-status-rejected-text bg-status-rejected-bg rounded-xl px-3 py-2 mb-3">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl bg-status-rejected-text text-white text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <div className="bg-surface-card border-b border-border px-4 pt-12 pb-3 sticky top-0 z-10">
        {/* Top row: back + actions */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-muted transition-colors"
          >
            <ArrowLeft size={20} className="text-text-primary" />
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[report.status] ?? ''}`}>
              {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
            </span>
            {isOwner && isOpen && (
              <div className="flex items-center gap-1 bg-surface-muted rounded-xl p-1">
                <Link
                  to={`/reports/${id}/edit`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-surface-card hover:text-brand-600 transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </Link>
                <button
                  onClick={() => { setShowDeleteConfirm(true); setDeleteError(null) }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-surface-card hover:text-status-rejected-text transition-colors"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Bottom row: title */}
        <h1 className="text-base font-bold text-text-primary leading-snug">{report.title}</h1>
      </div>

      <div className="px-4 py-5 flex flex-col gap-4 pb-28">
        {/* Photos */}
        {report.photoUrls?.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 overflow-x-auto pb-1">
            {report.photoUrls.map((url, i) => (
              <button key={i} onClick={() => setLightboxUrl(url)} className="shrink-0">
                <img src={url} alt="" className="w-32 h-32 rounded-xl object-cover border border-border" />
              </button>
            ))}
          </motion.div>
        )}

        {/* Details */}
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
              <span className="bg-surface-muted text-text-secondary px-2 py-0.5 rounded-full text-[11px] inline-flex w-fit">
                {report.category}
              </span>
            )}
          </div>
        </motion.div>

        {/* Reporter: claim review panel */}
        {isOwner && isClaimed && claim && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-card rounded-2xl border border-status-claimed-text/20 p-4"
          >
            <p className="text-xs font-semibold text-status-claimed-text mb-3">
              Someone claims to have found your item
            </p>

            {/* Claimant trust score */}
            {claimant && (
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-surface-muted flex items-center justify-center">
                  <User size={14} className="text-text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {claimant.first_name} {claimant.last_name}
                  </p>
                  <div className="flex items-center gap-1">
                    <Star size={11} className="text-status-open-text" />
                    <p className="text-[11px] text-text-muted">Trust score: {claimant.trust_score}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Claim photos */}
            {claim.photoUrls?.length > 0 && (
              <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
                {claim.photoUrls.map((url, i) => (
                  <button key={i} onClick={() => setLightboxUrl(url)} className="shrink-0">
                    <img src={url} alt="" className="w-24 h-24 rounded-xl object-cover border border-border" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleClaimAction('approve')}
                disabled={actioning}
                className="flex-1 h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 size={16} /> Approve
              </button>
              <button
                onClick={() => handleClaimAction('reject')}
                disabled={actioning}
                className="flex-1 h-11 rounded-xl border border-status-rejected-text/30 text-status-rejected-text text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <XCircle size={16} /> Reject
              </button>
            </div>
          </motion.div>
        )}

        {/* Reporter: approved — mark as resolved */}
        {isOwner && isApproved && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-status-open-bg rounded-2xl border border-status-open-text/20 p-4"
          >
            <p className="text-xs font-semibold text-status-open-text mb-1">Claim approved!</p>
            <p className="text-xs text-status-open-text/80 mb-3">
              Once you've received your item, mark it as resolved.
            </p>
            <button
              onClick={handleMarkResolved}
              disabled={actioning}
              className="w-full h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {actioning ? 'Saving…' : 'Mark as resolved'}
            </button>
          </motion.div>
        )}

        {/* Approved: messaging thread — only for reporter and claimant */}
        {isApproved && claim && (isOwner || claim?.claimant_id === session?.user.id) && (
          <MessageThread
            claim={claim}
            report={report}
            isReporter={isOwner}
          />
        )}

        {/* Reporter: proxy pickup registration — only when drop-off chosen */}
        {isOwner && isApproved && claim?.drop_off_chosen && (
          <ProxyRequestForm reportId={id} reporterId={session?.user.id} />
        )}

        {/* Reporter: real-time proxy confirmation request from admin */}
        {isOwner && isApproved && claim?.drop_off_chosen && (
          <ConfirmationRequestBanner reportId={id} />
        )}

        {/* Claimant: approved notice */}
        {!isOwner && isApproved && claim?.claimant_id === session?.user.id && (
          <div className="bg-status-approved-bg border border-status-approved-text/20 rounded-xl px-4 py-3 text-xs text-status-approved-text">
            <p className="font-semibold mb-0.5">Your claim was approved!</p>
            <p>Use the thread below to arrange handoff with the reporter.</p>
          </div>
        )}
        {isResolved && (
          <div className="bg-surface-muted rounded-2xl p-4 text-center">
            <CheckCircle2 size={24} className="text-status-open-text mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">Item recovered!</p>
            <p className="text-xs text-text-muted mt-0.5">This report has been resolved.</p>
          </div>
        )}

        {/* Non-owner: claim button */}
        {!isOwner && (isOpen || report?.last_rejected_claimant_id === session?.user?.id) && claim?.status !== 'pending' && claim?.status !== 'approved' && (
          <Link
            to={`/reports/${id}/claim`}
            className="w-full h-12 rounded-xl bg-brand-600 text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <MessageSquare size={16} /> I found this item
          </Link>
        )}

        {/* Non-owner: claim pending notice */}
        {!isOwner && isClaimed && (
          claim?.claimant_id === session?.user.id ? (
            <div className="bg-status-approved-bg border border-status-approved-text/20 rounded-xl px-4 py-3 text-xs text-status-approved-text">
              <p className="font-semibold mb-0.5">Your claim is under review.</p>
              <p>Your claim is pending the reporter's review. You'll be notified once a decision is made.</p>
            </div>
          ) : (
            <div className="bg-status-claimed-bg border border-status-claimed-text/20 rounded-xl px-4 py-3 text-xs text-status-claimed-text">
              This item is currently under claim review. You may still submit a tip if you have relevant information.
            </div>
          )
        )}

        {/* Claimant: rejection feedback */}
        {!isOwner && report?.last_rejected_claimant_id === session?.user?.id && !isClaimed && !isApproved && !isResolved && (
          <div className="bg-status-rejected-bg border border-status-rejected-text/20 rounded-xl px-4 py-3 text-xs text-status-rejected-text">
            <p className="font-semibold mb-0.5">Your claim was not approved.</p>
            <p>The reporter has reviewed and declined your claim. The item is now open for new claims.</p>
          </div>
        )}

        {/* Others: report reopened after a rejected claim */}
        {!isOwner && isOpen && report.had_rejected_claim && report.last_rejected_claimant_id !== session?.user.id && (
          <div className="bg-surface-muted border border-border rounded-xl px-4 py-3 text-xs text-text-secondary">
            A previous claim was reviewed and declined. This item is open again — submit a claim if you found it.
          </div>
        )}

        {/* Tips */}
        <div className="bg-surface-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <Lightbulb size={15} className="text-status-claimed-text" /> Tips & sightings
            </h2>
            <span className={`text-[11px] font-medium ${tips.length >= 25 ? 'text-status-rejected-text' : 'text-text-muted'}`}>
              {tips.length}/25
            </span>
          </div>

          {tips.length === 0 && (
            <p className="text-xs text-text-muted mb-3">No tips yet. If you've seen this item, leave a note below.</p>
          )}

          {tips.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {(() => {
                const parents = tips.filter((t) => !t.parent_tip_id)
                const repliesMap = tips.reduce((acc, t) => {
                  if (t.parent_tip_id) {
                    acc[t.parent_tip_id] = [...(acc[t.parent_tip_id] ?? []), t]
                  }
                  return acc
                }, {})

                return parents.map((parent) => (
                  <div key={parent.id} className="flex flex-col gap-1.5">
                    <TipCard
                      tip={parent}
                      isOwn={parent.user_id === session?.user.id}
                      isReply={false}
                      onCredit={isOwner && !creditedTipId && !parent.credited ? () => handleCreditTip(parent) : null}
                      credited={creditedTipId === parent.id || parent.credited}
                      onReply={() => {
                        setParentTipId(parent.id)
                        setTipText(`@${parent.users?.first_name ?? ''} `)
                      }}
                    />
                    {(repliesMap[parent.id] ?? []).map((reply) => (
                      <TipCard
                        key={reply.id}
                        tip={reply}
                        isOwn={reply.user_id === session?.user.id}
                        isReply={true}
                        onReply={() => {
                          setParentTipId(parent.id)
                          setTipText(`@${reply.users?.first_name ?? ''} `)
                        }}
                      />
                    ))}
                  </div>
                ))
              })()}
            </div>
          )}

          {tips.length >= 25 ? (
            <div className="bg-surface-muted rounded-xl px-3 py-2.5 text-xs text-text-secondary text-center">
              This report has reached the maximum of 25 tips. No further tips can be submitted.
            </div>
          ) : !isResolved && (
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