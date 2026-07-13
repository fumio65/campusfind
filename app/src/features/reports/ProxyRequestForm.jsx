import { useState, useEffect } from 'react'
import { UserCheck, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export default function ProxyRequestForm({ reportId, reporterId }) {
  const [existing, setExisting] = useState(undefined)
  const [showForm, setShowForm] = useState(false)
  const [proxyName, setProxyName] = useState('')
  const [proxyStudentId, setProxyStudentId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchExisting()
  }, [reportId])

  async function fetchExisting() {
    try {
      const res = await fetch(`${SERVER_URL}/proxy/${reportId}`)
      const data = await res.json()
      setExisting(data ?? null)
      if (data) {
        setProxyName(data.proxy_name)
        setProxyStudentId(data.proxy_student_id)
      }
    } catch {
      setExisting(null)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!proxyName.trim()) return setError("Please enter the proxy's full name.")
    if (!proxyStudentId.trim()) return setError("Please enter the proxy's student ID.")

    setSubmitting(true)
    try {
      const res = await fetch(`${SERVER_URL}/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          reporterId,
          proxyName: proxyName.trim(),
          proxyStudentId: proxyStudentId.trim(),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setExisting(body)
      setShowForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (existing === undefined) return null

  return (
    <div className="bg-surface-card rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <UserCheck size={15} className="text-brand-600 shrink-0" />
        <h3 className="text-sm font-semibold text-text-primary">Proxy pickup</h3>
      </div>

      {existing && !showForm ? (
        <div className="flex flex-col gap-2">
          <div className="bg-status-open-bg rounded-xl px-3 py-2.5 text-xs text-status-open-text flex items-start gap-2">
            <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Proxy registered</p>
              <p>
                <span className="font-medium">{existing.proxy_name}</span>{' '}
                ({existing.proxy_student_id}) is authorized to pick up your item at the ISSC office.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-brand-600 transition-colors"
          >
            <RefreshCw size={11} />
            Change proxy
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-text-secondary mb-3">
            Can't pick up the item yourself? Register someone to collect it on your behalf. The ISSC officer will verify their ID.
          </p>

          {error && (
            <div className="flex items-start gap-2 bg-status-rejected-bg text-status-rejected-text text-xs rounded-xl px-3 py-2.5 mb-3">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Proxy's full name <span className="text-status-rejected-text">*</span>
              </label>
              <input
                type="text"
                placeholder="Full name of the person picking up"
                value={proxyName}
                onChange={(e) => setProxyName(e.target.value)}
                className="w-full h-10 px-3 text-sm rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Proxy's Student ID <span className="text-status-rejected-text">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 23-00456"
                value={proxyStudentId}
                onChange={(e) => setProxyStudentId(e.target.value)}
                className="w-full h-10 px-3 text-sm rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-10 rounded-xl bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                {submitting ? 'Registering…' : 'Register proxy'}
              </button>
              {existing && (
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(null) }}
                  className="px-4 h-10 rounded-xl border border-border-strong text-xs text-text-secondary"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  )
}