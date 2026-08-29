import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, MessageSquare, Lightbulb, Star,
  X, ChevronRight, XCircle, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { useAuth } from '../../shared/lib/AuthContext'
import { useHistory, refreshHistory } from '../../shared/lib/repositories/history'
import { onSyncTrigger } from '../../shared/lib/appLifecycle'
import SyncStateChip from '../../shared/components/SyncStateChip'

const TABS = ['All', 'My Reports', 'My Claims', 'My Tips']
const EMPTY_HISTORY = []

const STATUS_STYLES = {
  open:     'bg-status-open-bg text-status-open-text',
  claimed:  'bg-status-claimed-bg text-status-claimed-text',
  approved: 'bg-status-approved-bg text-status-approved-text',
  resolved: 'bg-status-resolved-bg text-status-resolved-text',
  rejected: 'bg-status-rejected-bg text-status-rejected-text',
  pending:  'bg-status-claimed-bg text-status-claimed-text',
}

const REASON_LABELS = {
  claim_rejected:         'Claim rejected by reporter',
  multiple_rejections:    '3+ rejections within 30 days',
  no_show:                'No-show at agreed handoff',
  claim_approved_handoff: 'Claim approved & handoff completed',
  issc_dropoff:           'Item returned via ISSC drop-off',
  tip_credited:           'Tip helped recover an item',
}

function reasonLabel(reason) {
  return REASON_LABELS[reason] ?? reason?.replace(/_/g, ' ') ?? 'Trust score update'
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

function formatGroupDate(dateStr) {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

// ── Activity item row ─────────────────────────────────────────────────────────
function ActivityRow({ item }) {
  const isReport   = item._type === 'report'
  const isRejected = item._type === 'rejected'
  const isClaim    = item._type === 'claim'
  const isTip      = item._type === 'tip'

  const Icon = isReport ? FileText : isTip ? Lightbulb : isRejected ? XCircle : MessageSquare

  const iconBg = isReport   ? 'bg-status-open-bg'
    : isRejected             ? 'bg-status-rejected-bg'
    : isClaim                ? 'bg-status-claimed-bg'
    :                          'bg-brand-50'

  const iconColor = isReport   ? 'text-status-open-text'
    : isRejected               ? 'text-status-rejected-text'
    : isClaim                  ? 'text-status-claimed-text'
    :                            'text-brand-600'

  const title    = item.title ?? item.reports?.title ?? item.text ?? 'Unknown'
  const subtitle = isClaim || isRejected ? 'Claim on' : isTip ? 'Tip on' : null
  const to       = item.report_id
    ? `/reports/${item.report_id}`
    : item.id ? `/reports/${item.id}` : '/'

  return (
    <Link
      to={to}
      className="flex items-center gap-3 bg-surface-muted rounded-xl px-3 py-3 active:scale-[0.98] transition-transform"
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon size={15} className={iconColor} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        {subtitle && (
          <p className="text-[10px] text-text-muted leading-none mb-0.5">{subtitle}</p>
        )}
        <p className="text-xs font-medium text-text-primary truncate">{title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {item._syncStatus ? (
            <SyncStateChip status={item._syncStatus} />
          ) : (
            item.status && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? ''}`}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </span>
            )
          )}
          <span className="text-[10px] text-text-muted">{timeAgo(item.created_at)}</span>
        </div>
      </div>
      <ChevronRight size={14} className="text-text-muted shrink-0" />
    </Link>
  )
}

// ── Trust Score History Dialog ────────────────────────────────────────────────
function TrustHistoryDialog({ events, currentScore, onClose }) {
  const eventsOldestFirst = [...events].reverse()
  const baseline = eventsOldestFirst.reduce((acc, e) => acc - e.delta, currentScore)
  let running = baseline
  const eventsWithScore = eventsOldestFirst.map((e) => {
    running = Math.max(0, Math.min(200, running + e.delta))
    return { ...e, scoreAfter: running }
  })
  const eventsDisplay = [...eventsWithScore].reverse()

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-card rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-bold text-text-primary">Trust Score History</p>
            <p className="text-xs text-text-muted mt-0.5">Current score: {currentScore}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-muted">
            <X size={16} className="text-text-muted" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-2">
          {eventsDisplay.length === 0 ? (
            <div className="text-center py-10">
              <Star size={28} className="text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-muted">No trust score events yet.</p>
              <p className="text-xs text-text-muted mt-1">
                Your score changes when you submit claims, complete handoffs, or leave credited tips.
              </p>
            </div>
          ) : (
            eventsDisplay.map((event) => {
              const isPositive = event.delta > 0
              const isNeutral  = event.delta === 0
              const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown
              return (
                <div
                  key={event.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                    isPositive ? 'bg-status-open-bg border-status-open-text/20'
                      : isNeutral ? 'bg-surface-muted border-border'
                      : 'bg-status-rejected-bg border-status-rejected-text/20'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isPositive ? 'bg-status-open-text/10'
                      : isNeutral ? 'bg-surface-card'
                      : 'bg-status-rejected-text/10'
                  }`}>
                    <Icon size={15} className={
                      isPositive ? 'text-status-open-text'
                        : isNeutral ? 'text-text-muted'
                        : 'text-status-rejected-text'
                    } />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-snug ${
                      isPositive ? 'text-status-open-text'
                        : isNeutral ? 'text-text-secondary'
                        : 'text-status-rejected-text'
                    }`}>
                      {reasonLabel(event.reason)}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">{timeAgo(event.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-sm font-bold text-text-primary">{event.scoreAfter}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isPositive ? 'bg-status-open-text text-white'
                        : isNeutral ? 'bg-surface-muted text-text-muted'
                        : 'bg-status-rejected-text text-white'
                    }`}>
                      {isPositive ? `+${event.delta}` : event.delta}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const { session, profile } = useAuth()
  const [activeTab, setActiveTab]               = useState('All')
  const [showTrustHistory, setShowTrustHistory] = useState(false)

  // Reads reactively from the local cache (works offline); refreshHistory
  // below keeps the cache in sync with Supabase whenever we're online.
  const history = useHistory(session?.user?.id)
  const loading = history === undefined
  const reports = history?.reports ?? EMPTY_HISTORY
  const claims = history?.claims ?? EMPTY_HISTORY
  const tips = history?.tips ?? EMPTY_HISTORY
  const trustEvents = history?.trustEvents ?? EMPTY_HISTORY

  useEffect(() => {
    if (!session?.user?.id) return
    refreshHistory(session.user.id)
    return onSyncTrigger(() => refreshHistory(session.user.id))
  }, [session?.user?.id])

  // All items merged, typed, and sorted newest-first
  const allItems = useMemo(() => [
    ...reports.map((r) => ({ ...r, _type: 'report' })),
    ...claims.map((c) => ({ ...c, _type: c.status === 'rejected' ? 'rejected' : 'claim' })),
    ...tips.map((t) => ({ ...t, _type: 'tip' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [reports, claims, tips])

  // Filtered by active tab
  const filteredItems = useMemo(() => {
    if (activeTab === 'My Reports') return allItems.filter(i => i._type === 'report')
    if (activeTab === 'My Claims')  return allItems.filter(i => i._type === 'claim' || i._type === 'rejected')
    if (activeTab === 'My Tips')    return allItems.filter(i => i._type === 'tip')
    return allItems
  }, [allItems, activeTab])

  // Group by calendar date
  const grouped = useMemo(() => {
    const map = new Map()
    for (const item of filteredItems) {
      const key = new Date(item.created_at).toDateString()
      if (!map.has(key)) map.set(key, { label: formatGroupDate(item.created_at), items: [] })
      map.get(key).items.push(item)
    }
    return [...map.values()]
  }, [filteredItems])

  const totalGained = trustEvents.filter(e => e.delta > 0).reduce((sum, e) => sum + e.delta, 0)
  const totalLost   = trustEvents.filter(e => e.delta < 0).reduce((sum, e) => sum + e.delta, 0)

  return (
    <div className="min-h-screen bg-surface-page safe-top pb-28">

      <AnimatePresence>
        {showTrustHistory && (
          <TrustHistoryDialog
            events={trustEvents}
            currentScore={profile?.trust_score ?? 100}
            onClose={() => setShowTrustHistory(false)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-brand-600 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">History</h1>
            <p className="text-xs text-brand-200 mt-0.5">Your personal activity log</p>
          </div>
          {profile && (
            <button
              onClick={() => setShowTrustHistory(true)}
              className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full active:bg-white/30 transition-colors"
            >
              <Star size={13} className="text-white" />
              <span className="text-xs font-semibold text-white">
                Trust: {profile.trust_score ?? 100}
              </span>
              <ChevronRight size={11} className="text-white/70" />
            </button>
          )}
        </div>
      </div>

      {/* Summary counts */}
      {!loading && (
        <div className="px-4 pt-4 grid grid-cols-4 gap-2">
          {[
            { label: 'Reports',  count: reports.length,                                     color: 'text-status-open-text',     bg: 'bg-status-open-bg',     border: 'border-status-open-text/20'     },
            { label: 'Claims',   count: claims.filter(c => c.status !== 'rejected').length, color: 'text-status-claimed-text',  bg: 'bg-status-claimed-bg',  border: 'border-status-claimed-text/20'  },
            { label: 'Rejected', count: claims.filter(c => c.status === 'rejected').length, color: 'text-status-rejected-text', bg: 'bg-status-rejected-bg', border: 'border-status-rejected-text/20' },
            { label: 'Tips',     count: tips.length,                                         color: 'text-brand-600',            bg: 'bg-brand-50',           border: 'border-brand-200'               },
          ].map(({ label, count, color, bg, border }) => (
            <div
              key={label}
              className={`${bg} border ${border} rounded-2xl px-2 py-3 flex flex-col items-center gap-1`}
            >
              <p className={`text-xl font-bold leading-none ${color}`}>{count}</p>
              <p className={`text-[10px] font-semibold ${color} opacity-70 uppercase tracking-wide text-center`}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Trust Score card */}
      {!loading && (
        <div className="px-4 pt-3">
          <button
            onClick={() => setShowTrustHistory(true)}
            className="w-full bg-surface-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <Star size={18} className="text-brand-600" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-semibold text-text-primary">Trust Score History</p>
              <p className="text-xs text-text-muted mt-0.5">
                {trustEvents.length === 0
                  ? 'No events yet'
                  : `${trustEvents.length} event${trustEvents.length > 1 ? 's' : ''} · +${totalGained} gained, ${totalLost} lost`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-lg font-bold text-brand-600">{profile?.trust_score ?? 100}</span>
              <ChevronRight size={15} className="text-text-muted" />
            </div>
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="px-4 pt-4 pb-1 flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
              activeTab === tab
                ? 'bg-brand-600 text-white'
                : 'bg-surface-muted text-text-secondary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Activity feed */}
      <div className="px-4 pt-3 flex flex-col gap-5">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-surface-card rounded-xl animate-pulse border border-border" />
          ))
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-surface-muted flex items-center justify-center mb-3">
              <FileText size={24} className="text-text-muted" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">No activity yet</p>
            <p className="text-xs text-text-muted">
              {activeTab === 'All'
                ? 'Your reports, claims, and tips will appear here.'
                : `Your ${activeTab.toLowerCase()} will appear here.`}
            </p>
          </div>
        ) : (
          grouped.map(({ label, items }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <p className="text-[11px] font-bold text-text-muted uppercase tracking-wide mb-2 px-1">
                {label}
              </p>
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <ActivityRow key={`${item._type}-${item.id}`} item={item} />
                ))}
              </div>
            </motion.div>
          ))
        )}
      </div>

    </div>
  )
}