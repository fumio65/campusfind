import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, MapPin, Clock, Plus, X } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import { staggerContainer, staggerItem } from '../../shared/lib/motion'

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

function ReportCard({ report }) {
  const thumbnail = report.thumbnail

  return (
    <motion.div {...staggerItem}>
      <Link
        to={`/reports/${report.id}`}
        className="flex gap-3 bg-surface-card rounded-2xl border border-border p-3.5 active:scale-[0.98] transition-transform"
      >
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden bg-surface-muted flex items-center justify-center border border-border">
          {thumbnail ? (
            <img src={thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-muted flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-dashed border-border-strong rounded-md" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold text-text-primary leading-snug flex-1 truncate">
              {report.title}
            </h3>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[report.status] ?? ''}`}>
              {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-text-muted">
            {report.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin size={11} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{report.location}</span>
              </span>
            )}
            <span className="flex items-center gap-1 shrink-0">
              <Clock size={11} aria-hidden="true" />
              {timeAgo(report.created_at)}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export default function HomePage() {
  const { profile } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    fetchReports()
  }, [debouncedSearch])

  async function fetchReports() {
    setLoading(true)
    let query = supabase
      .from('reports')
      .select('id, title, description, location, status, created_at, type')
      .in('status', ['open', 'claimed', 'approved'])
      .order('created_at', { ascending: false })
      .limit(30)

    if (debouncedSearch.trim()) {
      query = query.or(
        `title.ilike.%${debouncedSearch}%,description.ilike.%${debouncedSearch}%,location.ilike.%${debouncedSearch}%`
      )
    }

    const { data } = await query
    if (!data) { setReports([]); setLoading(false); return }

    // Fetch first photo for each report as thumbnail
    const reportIds = data.map((r) => r.id)
    const { data: photos } = await supabase
      .from('report_photos')
      .select('report_id, storage_path')
      .in('report_id', reportIds)
      .order('position', { ascending: true })

    // Build thumbnail map: report_id -> first photo public URL
    const thumbMap = {}
    for (const p of photos ?? []) {
      if (!thumbMap[p.report_id]) {
        const { data: { publicUrl } } = supabase.storage.from('report-photos').getPublicUrl(p.storage_path)
        thumbMap[p.report_id] = publicUrl
      }
    }

    setReports(data.map((r) => ({ ...r, thumbnail: thumbMap[r.id] ?? null })))
    setLoading(false)
  }

  const firstName = profile?.first_name ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-brand-600 px-5 pt-12 pb-6 safe-top">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-brand-200 text-xs font-medium mb-0.5">{greeting},</p>
          <h1 className="text-white text-xl font-bold mb-4">{firstName}</h1>
        </motion.div>

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="relative"
        >
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search lost items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-10 text-sm rounded-xl bg-surface-card border-0 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </motion.div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-5">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface-card rounded-2xl border border-border p-4 animate-pulse">
                <div className="h-4 bg-surface-muted rounded w-2/3 mb-2" />
                <div className="h-3 bg-surface-muted rounded w-full mb-1" />
                <div className="h-3 bg-surface-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center text-center py-16"
          >
            <div className="w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center mb-4">
              <Search size={24} className="text-text-muted" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">
              {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No open reports yet'}
            </p>
            <p className="text-xs text-text-muted max-w-xs mb-6">
              {debouncedSearch
                ? 'Try different keywords or check the spelling.'
                : 'Lost something? File a report and let the campus help you find it.'}
            </p>
            {!debouncedSearch && (
              <Link
                to="/reports/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold"
              >
                <Plus size={16} aria-hidden="true" /> File a report
              </Link>
            )}
          </motion.div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-text-secondary">
                {debouncedSearch
                  ? `${reports.length} result${reports.length === 1 ? '' : 's'}`
                  : 'Recent reports'}
              </p>
            </div>
            <motion.div className="flex flex-col gap-3" {...staggerContainer} initial="initial" animate="animate">
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </motion.div>
          </>
        )}
      </div>
    </div>
  )
}