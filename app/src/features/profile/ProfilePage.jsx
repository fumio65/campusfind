import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  User, Star, TrendingUp, TrendingDown, AlertTriangle,
  LogOut, ChevronRight, Shield, Clock, CheckCircle2
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useRecentRejections, refreshHistory } from '../../shared/lib/repositories/history'
import { onSyncTrigger } from '../../shared/lib/appLifecycle'

const EMPTY_REJECTIONS = []

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

  // `profile` (from AuthContext) already carries trust_score/first_name/etc.
  // and is offline-cached, so no separate fetch is needed for it here.
  const loading = profile == null
  const rejections = useRecentRejections(session?.user?.id) ?? EMPTY_REJECTIONS

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
            {profile?.program && (
              <p className="text-xs text-brand-200 mt-0.5">{profile.program}</p>
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
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5 mb-3">
            <Clock size={15} className="text-brand-600" />
            30-Day Rejection Window
          </h2>

          {rejections.length === 0 ? (
            <div className="flex items-center gap-2 bg-status-open-bg rounded-xl px-3 py-2.5">
              <CheckCircle2 size={14} className="text-status-open-text shrink-0" />
              <p className="text-xs text-status-open-text font-medium">
                No rejected claims in the last 30 days. You're in good standing!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                rejections.length >= 3 ? 'bg-status-rejected-bg' : 'bg-status-claimed-bg'
              }`}>
                <AlertTriangle size={13} className={rejections.length >= 3 ? 'text-status-rejected-text' : 'text-status-claimed-text'} />
                <p className={`text-xs font-medium ${rejections.length >= 3 ? 'text-status-rejected-text' : 'text-status-claimed-text'}`}>
                  {rejections.length} rejection{rejections.length === 1 ? '' : 's'} in the last 30 days
                  {rejections.length >= 3 && ' — penalty applied'}
                </p>
              </div>
              {rejections.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-1">
                  <p className="text-xs text-text-secondary truncate flex-1">
                    {r.reports?.title ?? 'Unknown report'}
                  </p>
                  <p className="text-[10px] text-text-muted ml-2 shrink-0">
                    {formatDate(r.created_at)} · expires in {timeUntil(new Date(new Date(r.created_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString())}
                  </p>
                </div>
              ))}
            </div>
          )}
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
              { label: 'Program', value: profile?.program ?? '—' },
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