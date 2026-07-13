import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, FileText, MessageSquare,
  Lightbulb, Star, X, ChevronDown, XCircle
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const TABS = ['All', 'My Reports', 'My Claims', 'My Tips']
const VIEWS = ['month', 'week', 'day']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const STATUS_STYLES = {
  open: 'bg-status-open-bg text-status-open-text',
  claimed: 'bg-status-claimed-bg text-status-claimed-text',
  approved: 'bg-status-approved-bg text-status-approved-text',
  resolved: 'bg-status-resolved-bg text-status-resolved-text',
  rejected: 'bg-status-rejected-bg text-status-rejected-text',
  pending: 'bg-status-claimed-bg text-status-claimed-text',
}

const DOT_COLORS = {
  report: 'bg-status-open-text',
  claim: 'bg-status-claimed-text',
  rejected: 'bg-status-rejected-text',
  tip: 'bg-brand-600',
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

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatDate(date) {
  return date.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Year/Month picker modal
function DatePickerModal({ cursor, onSelect, onClose }) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)
  const [pickerYear, setPickerYear] = useState(cursor.getFullYear())

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text-primary">Jump to month</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-muted">
            <X size={15} className="text-text-muted" />
          </button>
        </div>

        {/* Year selector */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setPickerYear((y) => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-muted">
            <ChevronLeft size={15} className="text-text-secondary" />
          </button>
          <span className="text-sm font-bold text-text-primary">{pickerYear}</span>
          <button onClick={() => setPickerYear((y) => y + 1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-muted">
            <ChevronRight size={15} className="text-text-secondary" />
          </button>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {MONTHS.map((m, i) => {
            const isSelected = cursor.getFullYear() === pickerYear && cursor.getMonth() === i
            const isFuture = new Date(pickerYear, i) > new Date()
            return (
              <button
                key={m}
                disabled={isFuture}
                onClick={() => { onSelect(new Date(pickerYear, i, 1)); onClose() }}
                className={`py-2 rounded-xl text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-brand-600 text-white'
                    : isFuture
                      ? 'text-text-muted cursor-not-allowed opacity-40'
                      : 'hover:bg-surface-muted text-text-secondary'
                }`}
              >
                {m}
              </button>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Day activity dialog
function DaySheet({ date, items, onClose }) {
  const grouped = {
    report: items.filter(i => i._type === 'report'),
    claim: items.filter(i => i._type === 'claim'),
    rejected: items.filter(i => i._type === 'rejected'),
    tip: items.filter(i => i._type === 'tip'),
  }

  const sections = [
    { type: 'report', label: 'Reports', icon: FileText, bg: 'bg-status-open-bg', color: 'text-status-open-text' },
    { type: 'claim', label: 'Claims', icon: MessageSquare, bg: 'bg-status-claimed-bg', color: 'text-status-claimed-text' },
    { type: 'rejected', label: 'Rejected', icon: XCircle, bg: 'bg-status-rejected-bg', color: 'text-status-rejected-text' },
    { type: 'tip', label: 'Tips', icon: Lightbulb, bg: 'bg-brand-50', color: 'text-brand-600' },
  ].filter(s => grouped[s.type].length > 0)

  const total = items.length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-card rounded-2xl w-full max-w-sm max-h-[75vh] flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-bold text-text-primary">{formatDate(date)}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {total === 0 ? 'No activity' : `${total} item${total > 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-muted">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-4">
          {total === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-text-muted">No activity on this day.</p>
              <p className="text-xs text-text-muted mt-1">Only dates with dots have activity.</p>
            </div>
          ) : (
            sections.map(({ type, label, icon: Icon, bg, color }) => (
              <div key={type}>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${bg}`}>
                    <Icon size={12} className={color} />
                  </div>
                  <p className={`text-[11px] font-bold uppercase tracking-wide ${color}`}>{label}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${bg} ${color}`}>
                    {grouped[type].length}
                  </span>
                </div>

                {/* Items */}
                <div className="flex flex-col gap-1.5">
                  {grouped[type].map((item) => {
                    const to = item.report_id ? `/reports/${item.report_id}` : item.id ? `/reports/${item.id}` : '/'
                    return (
                      <Link key={item.id} to={to} onClick={onClose}
                        className="flex items-center gap-3 bg-surface-muted rounded-xl p-3 active:scale-[0.98] transition-transform">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
                          <Icon size={13} className={color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text-primary truncate">
                            {item.title ?? item.reports?.title ?? item.text ?? 'Unknown'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.status && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? ''}`}>
                                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                              </span>
                            )}
                            <span className="text-[10px] text-text-muted">{timeAgo(item.created_at)}</span>
                          </div>
                        </div>
                        <ChevronRight size={13} className="text-text-muted shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function HistoryPage() {
  const { session, profile } = useAuth()
  const [activeTab, setActiveTab] = useState('All')
  const [calView, setCalView] = useState('month')
  const [cursor, setCursor] = useState(new Date())
  const [reports, setReports] = useState([])
  const [claims, setClaims] = useState([])
  const [tips, setTips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [sheetDay, setSheetDay] = useState(null)
  const [summaryType, setSummaryType] = useState(null) // Date | null

  useEffect(() => {
    if (!session?.user?.id) return
    fetchAll()
  }, [session?.user?.id])

  async function fetchAll() {
    setLoading(true)
    const uid = session.user.id
    const [{ data: r }, { data: c }, { data: t }] = await Promise.all([
      supabase.from('reports').select('id, title, status, location, created_at').eq('reporter_id', uid).order('created_at', { ascending: false }),
      supabase.from('claims').select('id, status, created_at, report_id, reports(title)').eq('claimant_id', uid).order('created_at', { ascending: false }),
      supabase.from('tips').select('id, text, created_at, report_id, reports(title)').eq('user_id', uid).order('created_at', { ascending: false }),
    ])
    setReports(r ?? [])
    setClaims(c ?? [])
    setTips(t ?? [])
    setLoading(false)
  }

  const allItems = useMemo(() => [
    ...reports.map((r) => ({ ...r, _type: 'report' })),
    ...claims.map((c) => ({ ...c, _type: c.status === 'rejected' ? 'rejected' : 'claim' })),
    ...tips.map((t) => ({ ...t, _type: 'tip' })),
  ], [reports, claims, tips])

  const activityDates = useMemo(() => {
    const map = {}
    for (const item of allItems) {
      const d = new Date(item.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map[key]) map[key] = new Set()
      map[key].add(item._type)
    }
    return map
  }, [allItems])

  function getDayKey(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  }

  function getItemsForDay(date) {
    return allItems.filter((item) => isSameDay(new Date(item.created_at), date))
  }

  const calDays = useMemo(() => {
    if (calView === 'month') {
      const year = cursor.getFullYear()
      const month = cursor.getMonth()
      const firstDay = new Date(year, month, 1).getDay()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const days = []
      for (let i = 0; i < firstDay; i++) days.push(null)
      for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
      return days
    }
    if (calView === 'week') {
      const start = new Date(cursor)
      start.setDate(cursor.getDate() - cursor.getDay())
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        return d
      })
    }
    return [new Date(cursor)]
  }, [cursor, calView])

  function navigate(dir) {
    const d = new Date(cursor)
    if (calView === 'month') d.setMonth(d.getMonth() + dir)
    else if (calView === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setDate(d.getDate() + dir)
    setCursor(d)
  }

  function calTitle() {
    if (calView === 'month') return cursor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    if (calView === 'week') {
      const start = new Date(cursor)
      start.setDate(cursor.getDate() - cursor.getDay())
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `${start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return cursor.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  const today = new Date()

  return (
    <div className="min-h-screen bg-surface-page safe-top pb-28">

      {/* Date picker modal */}
      <AnimatePresence>
        {showDatePicker && (
          <DatePickerModal
            cursor={cursor}
            onSelect={(d) => { setCursor(d); setCalView('month') }}
            onClose={() => setShowDatePicker(false)}
          />
        )}
      </AnimatePresence>

      {/* Day sheet */}
      <AnimatePresence>
        {sheetDay && (
          <DaySheet
            date={sheetDay}
            items={getItemsForDay(sheetDay)}
            onClose={() => setSheetDay(null)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-brand-600 px-4 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">History</h1>
            <p className="text-xs text-brand-200 mt-0.5">Your personal activity log</p>
          </div>
          {profile && (
            <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
              <Star size={13} className="text-white" />
              <span className="text-xs font-semibold text-white">
                Trust: {profile.trust_score ?? 100}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* View switcher + navigation */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-surface-muted rounded-xl p-1">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setCalView(v)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                calView === v ? 'bg-surface-card text-text-primary shadow-sm' : 'text-text-muted'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-muted">
            <ChevronLeft size={16} className="text-text-secondary" />
          </button>
          {/* Tappable title opens date picker */}
          <button
            onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-surface-muted transition-colors"
          >
            <span className="text-xs font-semibold text-text-primary min-w-[110px] text-center">{calTitle()}</span>
            <ChevronDown size={12} className="text-text-muted shrink-0" />
          </button>
          <button onClick={() => navigate(1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-muted">
            <ChevronRight size={16} className="text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="px-4 pb-3">
        <div className="bg-surface-card rounded-2xl border border-border overflow-hidden">
          {calView !== 'day' && (
            <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
              {WEEKDAYS.map((d) => (
                <div key={d} className="h-8 flex items-center justify-center text-[11px] font-bold text-text-muted">{d}</div>
              ))}
            </div>
          )}

          <div className={calView === 'day' ? '' : 'grid grid-cols-7'}>
            {calView === 'day' ? (
              <button
                onClick={() => setSheetDay(new Date(cursor))}
                className="w-full p-4 flex items-center justify-between hover:bg-surface-muted transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-text-primary">
                    {cursor.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  {(() => {
                    const types = activityDates[getDayKey(cursor)]
                    return types
                      ? <div className="flex gap-1 mt-1">{[...types].map((t) => <span key={t} className={`w-2 h-2 rounded-full ${DOT_COLORS[t]}`} />)}</div>
                      : <p className="text-xs text-text-muted mt-0.5">No activity</p>
                  })()}
                </div>
                <ChevronRight size={16} className="text-text-muted" />
              </button>
            ) : (
              calDays.map((day, i) => {
                if (!day) return (
                  <div key={`empty-${i}`} className="w-full h-8" />
                )
                const key = getDayKey(day)
                const types = activityDates[key]
                const isToday = isSameDay(day, today)
                return (
                  <div key={key} className="w-full flex items-center justify-center py-0.5">
                    <button
                      onClick={() => setSheetDay(day)}
                      className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
                        isToday ? 'bg-brand-600' : 'hover:bg-surface-muted'
                      }`}
                    >
                      <span className={`text-[12px] leading-none font-medium ${
                        isToday ? 'text-white font-bold' : 'text-text-secondary'
                      }`}>
                        {day.getDate()}
                      </span>
                      {types ? (
                        <div className="flex gap-0.5 mt-0.5">
                          {[...types].slice(0, 3).map((type) => (
                            <span key={type} className={`w-1 h-1 rounded-full ${isToday ? 'bg-white/70' : DOT_COLORS[type]}`} />
                          ))}
                        </div>
                      ) : (
                        <div className="h-1" />
                      )}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Dot legend */}
        <div className="flex items-center gap-3 mt-2 px-1 flex-wrap">
          {Object.entries(DOT_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-[10px] text-text-muted capitalize">{type}</span>
            </div>
          ))}
          <span className="text-[10px] text-text-muted ml-auto">Tap a date to view</span>
        </div>
      </div>

      {/* Summary counts */}
      {!loading && (
        <div className="px-4 grid grid-cols-4 gap-2 pb-4">
          {[
            { label: 'Reports', count: reports.length, color: 'text-status-open-text', bg: 'bg-status-open-bg', border: 'border-status-open-text/20', type: 'report' },
            { label: 'Claims', count: claims.filter(c => c.status !== 'rejected').length, color: 'text-status-claimed-text', bg: 'bg-status-claimed-bg', border: 'border-status-claimed-text/20', type: 'claim' },
            { label: 'Rejected', count: claims.filter(c => c.status === 'rejected').length, color: 'text-status-rejected-text', bg: 'bg-status-rejected-bg', border: 'border-status-rejected-text/20', type: 'rejected' },
            { label: 'Tips', count: tips.length, color: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-200', type: 'tip' },
          ].map(({ label, count, color, bg, border, type }) => (
            <button
              key={label}
              onClick={() => setSummaryType(type)}
              className={`${bg} border ${border} rounded-2xl px-2 py-3 flex flex-col items-center gap-1 active:scale-95 transition-transform`}
            >
              <p className={`text-xl font-bold leading-none ${color}`}>{count}</p>
              <p className={`text-[10px] font-semibold ${color} opacity-70 uppercase tracking-wide text-center`}>{label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Summary detail dialog */}
      <AnimatePresence>
        {summaryType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-5"
            onClick={() => setSummaryType(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-card rounded-2xl w-full max-w-sm max-h-[75vh] flex flex-col shadow-xl"
            >
              {/* Dialog header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div>
                  <p className="text-sm font-bold text-text-primary capitalize">
                    {summaryType === 'rejected' ? 'Rejected Claims' : `My ${summaryType === 'tip' ? 'Tips' : summaryType === 'report' ? 'Reports' : 'Claims'}`}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">All time</p>
                </div>
                <button onClick={() => setSummaryType(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-muted">
                  <X size={16} className="text-text-muted" />
                </button>
              </div>

              {/* Items */}
              <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-2">
                {summaryType === 'report' && reports.map((item) => (
                  <Link key={item.id} to={`/reports/${item.id}`} onClick={() => setSummaryType(null)}
                    className="flex items-center gap-3 bg-surface-muted rounded-xl p-3 active:scale-[0.98] transition-transform">
                    <div className="w-8 h-8 rounded-full bg-status-open-bg flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-status-open-text" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? ''}`}>
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </span>
                        <span className="text-[10px] text-text-muted">{timeAgo(item.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-text-muted shrink-0" />
                  </Link>
                ))}

                {(summaryType === 'claim' || summaryType === 'rejected') && claims
                  .filter(c => summaryType === 'rejected' ? c.status === 'rejected' : c.status !== 'rejected')
                  .map((item) => (
                    <Link key={item.id} to={`/reports/${item.report_id}`} onClick={() => setSummaryType(null)}
                      className="flex items-center gap-3 bg-surface-muted rounded-xl p-3 active:scale-[0.98] transition-transform">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        item.status === 'approved' ? 'bg-status-approved-bg' : item.status === 'rejected' ? 'bg-status-rejected-bg' : 'bg-status-claimed-bg'
                      }`}>
                        <MessageSquare size={14} className={
                          item.status === 'approved' ? 'text-status-approved-text' : item.status === 'rejected' ? 'text-status-rejected-text' : 'text-status-claimed-text'
                        } />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-text-muted">Claim on</p>
                        <p className="text-xs font-medium text-text-primary truncate">{item.reports?.title ?? 'Unknown item'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? ''}`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                          <span className="text-[10px] text-text-muted">{timeAgo(item.created_at)}</span>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-text-muted shrink-0" />
                    </Link>
                  ))}

                {summaryType === 'tip' && tips.map((item) => (
                  <Link key={item.id} to={`/reports/${item.report_id}`} onClick={() => setSummaryType(null)}
                    className="flex items-center gap-3 bg-surface-muted rounded-xl p-3 active:scale-[0.98] transition-transform">
                    <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                      <Lightbulb size={14} className="text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-text-muted">Tip on</p>
                      <p className="text-xs font-medium text-text-primary truncate">{item.reports?.title ?? 'Unknown item'}</p>
                      <p className="text-[10px] text-text-muted truncate mt-0.5">{item.text}</p>
                    </div>
                    <ChevronRight size={14} className="text-text-muted shrink-0" />
                  </Link>
                ))}

                {((summaryType === 'report' && reports.length === 0) ||
                  (summaryType === 'tip' && tips.length === 0) ||
                  (summaryType === 'claim' && claims.filter(c => c.status !== 'rejected').length === 0) ||
                  (summaryType === 'rejected' && claims.filter(c => c.status === 'rejected').length === 0)) && (
                  <div className="text-center py-8">
                    <p className="text-sm text-text-muted">No items yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}