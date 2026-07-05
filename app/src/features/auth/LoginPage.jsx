import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import nwssuSeal from '../../assets/nwssu-seal.png'

export default function LoginPage() {
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Supabase Auth uses email — we store student_id as the email identifier
  // by convention: studentId@nwssu.local (a deterministic, non-real address)
  function toEmail(sid) {
    return `${sid.toLowerCase().replace('-', '')}@nwssu.local`
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)

    const sid = studentId.trim().toUpperCase()
    if (!/^\d{2}-\d{5}$/.test(sid)) {
      setError('Student ID must be in YY-NNNNN format (e.g. 24-00301).')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: toEmail(sid),
      password,
    })

    if (error) {
      setError('Incorrect student ID or password. Check your credentials and try again.')
    }
    setLoading(false)
    // On success, AuthContext detects the new session and App.jsx redirects
  }

  return (
    <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-6 safe-top safe-bottom">

      {/* Logo / identity block */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center mb-10"
      >
        <img
          src={nwssuSeal}
          alt="NwSSU seal"
          className="w-20 h-20 mb-4"
        />
        <div className="text-center">
          <div className="text-xs font-semibold tracking-widest text-brand-600 uppercase mb-1">
            Northwest Samar State University
          </div>
          <h1 className="text-2xl font-bold text-text-primary">CampusFind</h1>
          <p className="text-sm text-text-secondary mt-1">Lost &amp; Found — ISSC</p>
        </div>
      </motion.div>

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
        className="w-full max-w-sm bg-surface-card rounded-2xl border border-border p-6 shadow-sm"
      >
        <h2 className="text-base font-semibold text-text-primary mb-5">Sign in to your account</h2>

        {error && (
          <div className="flex items-start gap-2 bg-status-rejected-bg text-status-rejected-text text-xs rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Student ID
            </label>
            <input
              type="text"
              placeholder="e.g. 24-00301"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              autoCapitalize="characters"
              autoComplete="username"
              required
              className="w-full h-11 px-3.5 text-sm rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                data-1p-ignore
                data-lpignore="true"
                required
                className="w-full h-11 pl-3.5 pr-11 text-sm rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-1 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-60 transition-opacity active:opacity-80"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </motion.div>

      <p className="text-xs text-text-muted text-center mt-6 max-w-xs">
        Your account is provisioned by the Registrar. Contact ISSC if you can't sign in.
      </p>
    </div>
  )
}