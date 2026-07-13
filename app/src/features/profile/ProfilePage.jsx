import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  User, Star, TrendingUp, TrendingDown, AlertTriangle,
  LogOut, ChevronRight, Shield, Clock, CheckCircle2
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import { useNavigate } from 'react-router-dom'

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
  const [recentRejections, setRecentRejections] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) return
    setRecentRejections([])
    setLoading(true)
    fetchRejections()
  }, [])

  async function fetchRejections() {
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const { data } = await supabase
      .from('claims')
      .select('id, updated_at, reports(title)')
      .eq('claimant_id', session.user.id)
      .eq('status', 'rejected')
      .gte('updated_at', since.toISOString())
      .order('updated_at', { ascending: true })
      .limit(100)

    setRecentRejections(data ?? [])
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (!profile) return null

  const trustScore = profile.trust_score ?? 100
  const rejectionCount = recentRejections.length
  const oldestRejection = recentRejections[0]
  const expiryDate = oldestRejection
    ? new Date(new Date(oldestRejection.updated_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null

  // Trust score color
  const scoreColor = trustScore >= 90
    ? 'text-status-open-text'
    : trustScore >= 70
      ? 'text-status-claimed-text'
      : 'text-status-rejected-text'

  const scoreBg = trustScore >= 90
    ? 'bg-status-open-bg'
    : trustScore >= 70
      ? 'bg-status-claimed-bg'
      : 'bg-status-rejected-bg'

  const scoreLabel = trustScore >= 90 ? 'Good standing' : trustScore >= 70 ? 'Fair' : 'Poor standing'

  return (
    <div className="min-h-screen bg-surface-page safe-top pb-28">

      {/* Header */}
      <div className="bg-brand-600 px-4 pt-12 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-white">
              {profile.first_name?.[0]}{profile.last_name?.[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white truncate">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-sm text-brand-100">{profile.student_id}</p>
            {profile.program && (
              <p className="text-xs text-brand-200 mt-0.5">{profile.program}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 flex flex-col gap-4">

        {/* Trust Score card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
              <Shield size={15} className="text-brand-600" /> Trust Score
            </h2>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${scoreBg} ${scoreColor}`}>
              {scoreLabel}
            </span>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className={`w-16 h-16 rounded-full ${scoreBg} flex items-center justify-center shrink-0`}>
              <span className={`text-2xl font-bold ${scoreColor}`}>{trustScore}</span>
            </div>
            <div className="flex-1">
              <div className="w-full h-2 bg-surface-muted rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${
                    trustScore >= 90 ? 'bg-status-open-text' : trustScore >= 70 ? 'bg-status-claimed-text' : 'bg-status-rejected-text'
                  }`}
                  style={{ width: `${Math.min(100, trustScore / 2)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-text-muted">0</span>
                <span className="text-[10px] text-text-muted">200</span>
              </div>
            </div>
          </div>

          {/* How score changes */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <TrendingUp size={12} className="text-status-open-text shrink-0" />
              <span>+5 when a claim is approved and item is recovered</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <TrendingDown size={12} className="text-status-rejected-text shrink-0" />
              <span>-5 when a claim is rejected by the reporter</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <TrendingDown size={12} className="text-status-rejected-text shrink-0" />
              <span>-5 extra on the 3rd rejection within 30 days</span>
            </div>
          </div>
        </motion.div>

        {/* 30-day rejection window */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm"
        >
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5 mb-3">
            <Clock size={15} className="text-brand-600" /> 30-Day Rejection Window
          </h2>

          {loading ? (
            <div className="h-10 bg-surface-muted rounded-xl animate-pulse" />
          ) : rejectionCount === 0 ? (
            <div className="flex items-center gap-2 text-xs text-status-open-text bg-status-open-bg rounded-xl px-3 py-2.5">
              <CheckCircle2 size={14} className="shrink-0" />
              No rejected claims in the last 30 days. You're in good standing!
            </div>
          ) : (
            <div className="flex flex-col gap-2">

              {/* Status message */}
              <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 ${
                rejectionCount >= 3
                  ? 'bg-status-rejected-bg text-status-rejected-text'
                  : rejectionCount === 2
                    ? 'bg-status-claimed-bg text-status-claimed-text'
                    : 'bg-surface-muted text-text-secondary'
              }`}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">
                    {rejectionCount} rejection{rejectionCount > 1 ? 's' : ''} in the last 30 days
                  </p>
                  {rejectionCount === 1 && (
                    <p>Be careful — a 3rd rejection within 30 days triggers an extra -5 penalty.</p>
                  )}
                  {rejectionCount === 2 && (
                    <p>One more rejection this month will trigger an additional -5 penalty.</p>
                  )}
                  {rejectionCount >= 3 && (
                    <p>You have reached the 3-rejection threshold. The extra -5 penalty is now active.</p>
                  )}
                </div>
              </div>

              {/* Window reset */}
              {expiryDate && (
                <div className="flex items-center justify-between text-xs bg-surface-muted rounded-xl px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <Clock size={11} className="shrink-0" />
                    Window resets when oldest expires
                  </span>
                  <span className="font-semibold text-text-primary">
                    {formatDate(expiryDate)} · {timeUntil(expiryDate)}
                  </span>
                </div>
              )}

              {/* Rejection list */}
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-col gap-0.5 px-1">
                  <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                    Rejected claims this month
                  </p>
                  <p className="text-[11px] text-text-muted">
                    The number shows which rejection this is. A 3rd triggers an extra -5 penalty.
                  </p>
                </div>
                {recentRejections.map((r, i) => {
                  const itemExpiry = new Date(new Date(r.updated_at).getTime() + 30 * 24 * 60 * 60 * 1000)
                  const isThird = i + 1 === 3
                  const badgeStyle = isThird
                    ? 'bg-status-rejected-text text-white'
                    : i + 1 === 2
                      ? 'bg-status-claimed-text/20 text-status-claimed-text'
                      : 'bg-border-strong text-text-secondary'
                  return (
                    <div key={r.id} className="flex items-center justify-between bg-surface-muted rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${badgeStyle}`}>
                          {i + 1}
                        </span>
                        <span className="text-xs font-medium text-text-primary truncate">
                          {r.reports?.title ?? 'Unknown item'}
                        </span>
                        {isThird && (
                          <span className="text-[10px] bg-status-rejected-bg text-status-rejected-text px-1.5 py-0.5 rounded-full font-medium shrink-0">
                            -5 extra
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-text-muted shrink-0 ml-2">
                        {itemExpiry.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* Account info */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-card rounded-2xl border border-border overflow-hidden shadow-sm"
        >
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
              <User size={15} className="text-brand-600" /> Account
            </h2>
          </div>
          {[
            { label: 'Student ID', value: profile.student_id },
            { label: 'Year level', value: profile.year_level ?? '—' },
            { label: 'Program', value: profile.program ?? '—' },
            { label: 'Status', value: profile.status ?? 'Active' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
              <span className="text-xs text-text-muted">{label}</span>
              <span className="text-xs font-medium text-text-primary capitalize">{value}</span>
            </div>
          ))}
        </motion.div>

        {/* Sign out */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={handleSignOut}
          className="w-full flex items-center justify-between bg-surface-card rounded-2xl border border-border px-4 py-3.5 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <LogOut size={16} className="text-status-rejected-text" />
            <span className="text-sm font-medium text-status-rejected-text">Sign out</span>
          </div>
          <ChevronRight size={16} className="text-text-muted" />
        </motion.button>

      </div>
    </div>
  )
}