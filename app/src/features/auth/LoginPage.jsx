import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'

export default function LoginPage() {
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function toEmail(sid) {
    return `${sid.toLowerCase().replace('-', '')}@nwssu.local`
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formatted = studentId.trim().toUpperCase()

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: toEmail(formatted),
      password,
    })

    if (signInError) {
      setError('Invalid Student ID or password. Please try again.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-brand-600 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Branding */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">CampusFind</h1>
          <p className="text-brand-200 text-sm mt-1">NwSSU Lost & Found</p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-white rounded-2xl shadow-2xl p-6"
        >
          <h2 className="text-lg font-bold text-text-primary mb-1">Welcome back</h2>
          <p className="text-xs text-text-muted mb-5">Sign in with your student credentials</p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 bg-status-rejected-bg border border-status-rejected-text/20 text-status-rejected-text text-xs rounded-xl px-3 py-2.5 mb-4"
            >
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Student ID
              </label>
              <input
                type="text"
                placeholder="e.g. 24-00301"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck="false"
                required
                className="w-full h-10 px-3 text-sm rounded-lg border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full h-10 px-3 pr-10 text-sm rounded-lg border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !studentId.trim() || !password}
              className="w-full h-10 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs text-text-muted mt-4">
            Forgot your password?{' '}
            <span className="font-medium text-brand-600">Visit the ISSC office</span>
          </p>
        </motion.div>

      </div>
    </div>
  )
}