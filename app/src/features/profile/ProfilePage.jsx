import { useState } from 'react'
import { motion } from 'framer-motion'
import { LogOut, User, Shield, Star, ChevronRight } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

export default function ProfilePage() {
  const { profile } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    // AuthContext detects session = null → App.jsx redirects to /login
  }

  return (
    <div className="min-h-screen bg-surface-page safe-top safe-bottom">
      {/* Header */}
      <div className="bg-brand-600 px-5 pt-12 pb-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-full bg-brand-400 flex items-center justify-center shrink-0">
            <User size={28} className="text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-white text-lg font-bold">
              {profile?.first_name} {profile?.last_name}
            </h1>
            <p className="text-brand-200 text-xs">{profile?.student_id}</p>
            {profile?.program && (
              <p className="text-brand-200 text-xs mt-0.5">{profile.program}</p>
            )}
          </div>
        </motion.div>
      </div>

      <div className="px-4 py-5 flex flex-col gap-4">
        {/* Trust score */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-surface-card rounded-2xl border border-border p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-open-bg flex items-center justify-center">
              <Star size={18} className="text-status-open-text" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Trust score</p>
              <p className="text-xl font-bold text-text-primary">{profile?.trust_score ?? 100}</p>
            </div>
          </div>
          <p className="text-xs text-text-muted max-w-[140px] text-right">
            Visible to reporters when you submit a claim.
          </p>
        </motion.div>

        {/* Account info */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="bg-surface-card rounded-2xl border border-border overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Account</p>
          </div>
          <div className="divide-y divide-border">
            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-text-secondary">Student ID</p>
              <p className="text-sm font-medium text-text-primary">{profile?.student_id}</p>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-text-secondary">Year level</p>
              <p className="text-sm font-medium text-text-primary">{profile?.year_level ?? '—'}</p>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-text-secondary">Role</p>
              <div className="flex items-center gap-1.5">
                {profile?.role === 'admin' && <Shield size={13} className="text-brand-600" />}
                <p className="text-sm font-medium text-text-primary capitalize">{profile?.role}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Sign out */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full bg-surface-card rounded-2xl border border-border p-4 flex items-center gap-3 hover:bg-surface-muted transition-colors disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-status-rejected-bg flex items-center justify-center">
              <LogOut size={18} className="text-status-rejected-text" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-status-rejected-text">
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </p>
          </button>
        </motion.div>
      </div>
    </div>
  )
}