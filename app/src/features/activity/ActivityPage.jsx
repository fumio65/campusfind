import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileText, MessageSquare, Lightbulb, CheckCircle2, XCircle, Clock, ChevronRight } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import { staggerContainer, staggerItem } from '../../shared/lib/motion'

const TABS = ['All', 'My Reports', 'My Claims', 'My Tips']

const STATUS_STYLES = {
  open: 'bg-status-open-bg text-status-open-text',
  claimed: 'bg-status-claimed-bg text-status-claimed-text',
  approved: 'bg-status-approved-bg text-status-approved-text',
  resolved: 'bg-status-resolved-bg text-status-resolved-text',
  rejected: 'bg-status-rejected-bg text-status-rejected-text',
  pending: 'bg-status-claimed-bg text-status-claimed-text',
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function EmptyState({ tab }) {
  const messages = {
    'My Reports': { icon: FileText, text: 'No reports filed yet.', sub: 'Tap + to report a lost item.' },
    'My Claims': { icon: MessageSquare, text: 'No claims submitted yet.', sub: 'Find a lost item and submit a claim.' },
    'My Tips': { icon: Lightbulb, text: 'No tips left yet.', sub: 'Open any report and share a sighting.' },
    'All': { icon: FileText, text: 'No activity yet.', sub: 'Your reports, claims and tips will appear here.' },
  }
  const { icon: Icon, text, sub } = messages[tab] ?? messages['All']
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div className="w-14 h-14 rounded-full bg-surface-muted flex items-center justify-center mb-3">
        <Icon size={22} className="text-text-muted" />
      </div>
      <p className="text-sm font-semibold text-text-primary mb-1">{text}</p>
      <p className="text-xs text-text-muted">{sub}</p>
    </div>
  )
}

export default function ActivityPage() {
  const { session } = useAuth()
  const [activeTab, setActiveTab] = useState('All')
  const [reports, setReports] = useState([])
  const [claims, setClaims] = useState([])
  const [tips, setTips] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActivity()
  }, [])

  async function fetchActivity() {
    setLoading(true)
    const uid = session.user.id

    const [{ data: myReports }, { data: myClaims }, { data: myTips }] = await Promise.all([
      supabase
        .from('reports')
        .select('id, title, status, location, created_at')
        .eq('reporter_id', uid)
        .order('created_at', { ascending: false }),
      supabase
        .from('claims')
        .select('id, status, created_at, report_id, reports(title)')
        .eq('claimant_id', uid)
        .order('created_at', { ascending: false }),
      supabase
        .from('tips')
        .select('id, text, created_at, report_id, reports(title)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
    ])

    setReports(myReports ?? [])
    setClaims(myClaims ?? [])
    setTips(myTips ?? [])
    setLoading(false)
  }

  const allItems = [
    ...( reports.map((r) => ({ ...r, _type: 'report' })) ),
    ...( claims.map((c) => ({ ...c, _type: 'claim' })) ),
    ...( tips.map((t) => ({ ...t, _type: 'tip' })) ),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const visibleItems =
    activeTab === 'All' ? allItems :
    activeTab === 'My Reports' ? reports.map((r) => ({ ...r, _type: 'report' })) :
    activeTab === 'My Claims' ? claims.map((c) => ({ ...c, _type: 'claim' })) :
    tips.map((t) => ({ ...t, _type: 'tip' }))

  return (
    <div className="min-h-screen bg-surface-page safe-top">
      {/* Header */}
      <div className="bg-brand-600 px-5 pt-12 pb-4">
        <h1 className="text-white text-xl font-bold">Activity</h1>
        <p className="text-brand-200 text-xs mt-0.5">Your reports, claims and tips</p>
      </div>

      {/* Tabs */}
      <div className="bg-surface-card border-b border-border sticky top-0 z-10">
        <div className="flex overflow-x-auto scrollbar-hide px-4 gap-1 py-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-brand-600 text-white'
                  : 'text-text-secondary hover:bg-surface-muted'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-surface-card rounded-2xl animate-pulse border border-border" />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <motion.div className="flex flex-col gap-3" {...staggerContainer} initial="initial" animate="animate">
            {visibleItems.map((item) => {
              if (item._type === 'report') {
                return (
                  <motion.div key={`r-${item.id}`} {...staggerItem}>
                    <Link
                      to={`/reports/${item.id}`}
                      className="flex items-center gap-3 bg-surface-card rounded-2xl border border-border p-4 active:scale-[0.98] transition-transform"
                    >
                      <div className="w-9 h-9 rounded-full bg-status-open-bg flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-status-open-text" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-text-primary truncate">{item.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? ''}`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                          <span className="text-[11px] text-text-muted">{timeAgo(item.created_at)}</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-text-muted shrink-0" />
                    </Link>
                  </motion.div>
                )
              }

              if (item._type === 'claim') {
                const statusIcon = item.status === 'approved'
                  ? <CheckCircle2 size={16} className="text-status-approved-text" />
                  : item.status === 'rejected'
                    ? <XCircle size={16} className="text-status-rejected-text" />
                    : <Clock size={16} className="text-status-claimed-text" />

                return (
                  <motion.div key={`c-${item.id}`} {...staggerItem}>
                    <Link
                      to={`/reports/${item.report_id}`}
                      className="flex items-center gap-3 bg-surface-card rounded-2xl border border-border p-4 active:scale-[0.98] transition-transform"
                    >
                      <div className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center shrink-0">
                        <MessageSquare size={16} className="text-text-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {item.reports?.title ?? 'Claimed item'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? ''}`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                          <span className="text-[11px] text-text-muted">{timeAgo(item.created_at)}</span>
                        </div>
                      </div>
                      {statusIcon}
                    </Link>
                  </motion.div>
                )
              }

              // tip
              return (
                <motion.div key={`t-${item.id}`} {...staggerItem}>
                  <Link
                    to={`/reports/${item.report_id}`}
                    className="flex items-center gap-3 bg-surface-card rounded-2xl border border-border p-4 active:scale-[0.98] transition-transform"
                  >
                    <div className="w-9 h-9 rounded-full bg-status-claimed-bg flex items-center justify-center shrink-0">
                      <Lightbulb size={16} className="text-status-claimed-text" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {item.reports?.title ?? 'Tip'}
                      </p>
                      <p className="text-xs text-text-secondary truncate mt-0.5">{item.text}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{timeAgo(item.created_at)}</p>
                    </div>
                    <ChevronRight size={16} className="text-text-muted shrink-0" />
                  </Link>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </div>
  )
}