import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p) => /\d/.test(p) },
]

export default function ChangePasswordPage() {
  const { refreshProfile } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const rulesPass = RULES.every((r) => r.test(password))
  const matches = password && password === confirm

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!rulesPass) return setError('Password does not meet the requirements below.')
    if (!matches) return setError('Passwords do not match.')

    setLoading(true)
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      const msg = pwError.message.toLowerCase()
      if (msg.includes('different') || msg.includes('same')) {
        setError('Your new password must be different from your initial password.')
      } else {
        setError(pwError.message)
      }
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('users').update({ force_password_change: false }).eq('id', user.id)
    await refreshProfile()
    setTimeout(() => {
      window.location.replace('/')
    }, 100)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-6 safe-top safe-bottom">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="mb-7">
          <h1 className="text-xl font-bold text-text-primary">Set your password</h1>
          <p className="text-sm text-text-secondary mt-1">
            This is your first sign-in. Choose a password you'll remember.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-status-rejected-bg text-status-rejected-text text-xs rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a strong password"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                required
                className="w-full h-11 pl-3.5 pr-11 text-sm rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            {password.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1">
                {RULES.map((rule) => {
                  const pass = rule.test(password)
                  return (
                    <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${pass ? 'text-status-open-text' : 'text-text-muted'}`}>
                      <CheckCircle2 size={12} className={pass ? 'text-status-open-text' : 'text-border-strong'} />
                      {rule.label}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Confirm password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                required
                className={`w-full h-11 pl-3.5 pr-11 text-sm rounded-xl border bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted ${
                  confirm && !matches ? 'border-status-rejected-text' : 'border-border-strong'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {confirm && !matches && (
              <p className="text-xs text-status-rejected-text mt-1">Passwords don't match.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-1 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 transition-opacity active:opacity-80"
          >
            {loading ? 'Saving…' : 'Set password & continue'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}