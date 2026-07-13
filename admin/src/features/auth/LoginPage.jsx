import { useState } from 'react'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { supabase } from '../../shared/lib/supabaseClient'
import nwssuSeal from '../../assets/nwssu-seal.png'

export default function AdminLoginPage() {
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

    const sid = studentId.trim().toUpperCase()
    if (!/^\d{2}-\d{5}$/.test(sid)) {
      setError('Student ID must be in YY-NNNNN format (e.g. 00-00001).')
      return
    }

    setLoading(true)
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: toEmail(sid),
      password,
    })

    if (authError) {
      setError('Incorrect student ID or password.')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profile?.role !== 'admin') {
      await supabase.auth.signOut()
      setError('This account does not have admin access.')
      setLoading(false)
      return
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center mb-8">
        <img src={nwssuSeal} alt="NwSSU seal" className="w-20 h-20 mb-4" />
        <div className="text-center">
          <div className="text-xs font-semibold tracking-widest text-brand-600 uppercase mb-1">
            Northwest Samar State University
          </div>
          <h1 className="text-2xl font-bold text-text-primary">CampusFind</h1>
          <p className="text-sm text-text-secondary mt-1">Admin Dashboard — ISSC</p>
        </div>
      </div>

      <div className="w-full max-w-sm bg-surface-card rounded-2xl border border-border p-6 shadow-sm">
        <h2 className="text-base font-semibold text-text-primary mb-5">Sign in to continue</h2>

        {error && (
          <div className="flex items-start gap-2 bg-status-rejected-bg text-status-rejected-text text-xs rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">Student ID</label>
            <input
              type="text"
              placeholder="e.g. 00-00001"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              autoComplete="username"
              required
              className="w-full h-11 px-3.5 text-sm rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                data-lpignore="true"
                required
                className="w-full h-11 pl-3.5 pr-11 text-sm rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-1 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="text-xs text-text-muted text-center mt-5">
        Admin access only. Students use the CampusFind mobile app.
      </p>
    </div>
  )
}