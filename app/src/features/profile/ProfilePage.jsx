import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  User, Star, TrendingUp, TrendingDown, AlertTriangle,
  LogOut, ChevronRight, Shield, Clock, CheckCircle2, FileText
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { useHistory, useRecentRejections, refreshHistory } from '../../shared/lib/repositories/history'
import { onSyncTrigger } from '../../shared/lib/appLifecycle'

const EMPTY_HISTORY_REPORTS = []

const EMPTY_REJECTIONS = []

// programs.program_name is stored in ALL CAPS in the database (seed data
// convention) - fine for exact-match lookups, but shouldn't be shown to a
// student shouting. Minor connector words stay lowercase unless they're the
// first word, matching normal title-case style ("Bachelor of Science in
// Information Technology").
const MINOR_WORDS = new Set(['of', 'in', 'and', 'the', 'for', 'a', 'an'])
function toTitleCase(text) {
  return text
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i > 0 && MINOR_WORDS.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

function timeUntil(dateStr) {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  return `${days} day${days === 1 ? '' : 's'}`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
}

export default function ProfilePage() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [programName, setProgramName] = useState(null)

  // `profile` (from AuthContext) already carries trust_score/first_name/etc.
  // and is offline-cached, so no separate fetch is needed for it here.
  const loading = profile == null

  // Older accounts (created before the bulk-import/program_code work) only
  // ever got `program_code`/`department_code` backfilled, not the legacy
  // free-text `program` column - so profile.program is null for them even
  // though they do have an assigned program. Resolve the human-readable
  // name from the programs table in that case, so the Profile page doesn't
  // show it as blank.
  useEffect(() => {
    if (profile?.program || !profile?.program_code) {
      setProgramName(null)
      return
    }
    let cancelled = false
    supabase
      .from('programs')
      .select('program_name')
      .eq('program_code', profile.program_code)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProgramName(data?.program_name ? toTitleCase(data.program_name) : null)
      })
    return () => {
      cancelled = true
    }
  }, [profile?.program, profile?.program_code])

  const displayProgram = profile?.program ?? programName ?? profile?.program_code ?? null
  const rejections = useRecentRejections(session?.user?.id) ?? EMPTY_REJECTIONS
  // Reuses the same cached history repository History itself reads from
  // (refreshHistory is already called below) - just needs the count here.
  const reportCount = (useHistory(session?.user?.id)?.reports ?? EMPTY_HISTORY_REPORTS).length

  useEffect(() => {
    if (!session?.user?.id) return
    refreshHistory(session.user.id)
    return onSyncTrigger(() => refreshHistory(session.user.id))
  }, [session?.user?.id])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const score = profile?.trust_score ?? 100
  const maxScore = 200
  const pct = Math.min((score / maxScore) * 100, 100)
  const standing = score >= 80 ? 'Good standing' : score >= 50 ? 'Fair standing' : 'Poor standing'
  const standingColor = score >= 80
    ? 'text-status-open-text bg-status-open-bg'
    : score >= 50
      ? 'text-status-claimed-text bg-status-claimed-bg'
      : 'text-status-rejected-text bg-status-rejected-bg'

  const initials = profile
    ? `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()
    : '?'

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page">
        <div className="bg-brand-600 px-4 pt-12 pb-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 animate-pulse" />
            <div className="flex flex-col gap-2">
              <div className="h-4 bg-white/20 rounded w-32 animate-pulse" />
              <div className="h-3 bg-white/20 rounded w-20 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-page">

      {/* Logout confirmation dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
          >
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-status-rejected-bg flex items-center justify-center mb-3">
                <LogOut size={22} className="text-status-rejected-text" />
              </div>
              <h3 className="text-sm font-bold text-text-primary mb-1">Log out?</h3>
              <p className="text-xs text-text-secondary">
                Are you sure you want to log out of CampusFind?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 h-11 rounded-xl bg-status-rejected-text text-white text-sm font-semibold hover:opacity-90 transition-colors"
              >
                Log out
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <div className="bg-brand-600 px-4 pt-12 pb-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white truncate">
              {profile?.first_name} {profile?.last_name}
            </h1>
            <p className="text-sm text-brand-100">{profile?.student_id}</p>
            {displayProgram && (
              <p className="text-xs text-brand-200 mt-0.5">{displayProgram}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-4">
        {/* Trust Score card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
              <Shield size={15} className="text-brand-600" />
              Trust Score
            </h2>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${standingColor}`}>
              {standing}
            </span>
          </div>

          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-full bg-brand-50 border-2 border-brand-200 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-brand-600">{score}</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-text-muted mb-1">
                <span>0</span>
                <span>{maxScore}</span>
              </div>
              <div className="h-2.5 bg-surface-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-600 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-status-open-text flex items-center gap-1.5">
              <TrendingUp size={11} />
              +5 when a claim is approved and item is recovered
            </p>
            <p className="text-[11px] text-status-rejected-text flex items-center gap-1.5">
              <TrendingDown size={11} />
              -5 when a claim is rejected by the reporter
            </p>
            <p className="text-[11px] text-status-rejected-text flex items-center gap-1.5">
              <TrendingDown size={11} />
              -5 extra on the 3rd rejection within 30 days
            </p>
          </div>
        </motion.div>

        {/* 30-Day Rejection Window */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm"
        >
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5 mb-1">
            <Clock size={15} className="text-brand-600" />
            30-Day Rejection Window
          </h2>
          <p className="text-[11px] text-text-muted mb-3">
            Rejections count against you for 30 days, then automatically drop off.
          </p>

          {rejections.length === 0 ? (
            <div className="flex items-center gap-2 bg-status-open-bg rounded-xl px-3 py-2.5">
              <CheckCircle2 size={14} className="text-status-open-text shrink-0" />
              <p className="text-xs text-status-open-text font-medium">
                No rejected claims in the last 30 days. You're in good standing!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Progress toward the 3-rejection penalty */}
              <div className={`rounded-xl px-3 py-2.5 ${
                rejections.length >= 3 ? 'bg-status-rejected-bg' : 'bg-status-claimed-bg'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className={`text-xs font-semibold flex items-center gap-1.5 ${
                    rejections.length >= 3 ? 'text-status-rejected-text' : 'text-status-claimed-text'
                  }`}>
                    <AlertTriangle size={13} className="shrink-0" />
                    {Math.min(rejections.length, 3)} of 3 rejections
                  </p>
                  <span className={`text-[10px] font-medium shrink-0 ${
                    rejections.length >= 3 ? 'text-status-rejected-text' : 'text-status-claimed-text'
                  }`}>
                    {rejections.length >= 3
                      ? '-5 penalty applied'
                      : `${3 - rejections.length} more triggers a penalty`}
                  </span>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i < Math.min(rejections.length, 3)
                          ? rejections.length >= 3 ? 'bg-status-rejected-text' : 'bg-status-claimed-text'
                          : 'bg-surface-card'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Individual rejections, newest first */}
              <div className="flex flex-col gap-2">
                {rejections.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 px-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text-secondary truncate">
                        {r.reports?.title ?? 'Unknown report'}
                      </p>
                      <p className="text-[10px] text-text-muted">{formatDate(r.created_at)}</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-text-secondary bg-surface-muted px-2 py-1 rounded-full whitespace-nowrap">
                      Expires in {timeUntil(new Date(new Date(r.created_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString())}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* My Reports shortcut */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <Link
            to="/history?tab=reports"
            className="w-full flex items-center justify-between bg-surface-card rounded-2xl border border-border px-4 py-3.5 shadow-sm hover:bg-surface-muted transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-status-open-bg flex items-center justify-center shrink-0">
                <FileText size={15} className="text-status-open-text" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">My Reports</p>
                <p className="text-[11px] text-text-muted">
                  {reportCount} report{reportCount === 1 ? '' : 's'} filed
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-text-muted shrink-0" />
          </Link>
        </motion.div>

        {/* Account */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-card rounded-2xl border border-border shadow-sm overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
              <User size={15} className="text-brand-600" />
              Account
            </h2>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: 'Full name', value: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() },
              { label: 'Student ID', value: profile?.student_id ?? '—' },
              { label: 'Program', value: displayProgram ?? '—' },
              { label: 'Email', value: session?.user?.email ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
                <p className="text-xs text-text-muted">{label}</p>
                <p className="text-xs font-medium text-text-primary">{value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Log out */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="pb-6"
        >
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-between bg-surface-card rounded-2xl border border-border px-4 py-3.5 shadow-sm hover:bg-surface-muted transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <LogOut size={16} className="text-status-rejected-text" />
              <span className="text-sm font-medium text-status-rejected-text">Log out</span>
            </div>
            <ChevronRight size={16} className="text-text-muted" />
          </button>
        </motion.div>
      </div>
    </div>
  )
}