import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export default function ConfirmationRequestBanner({ reportId }) {
  const [request, setRequest] = useState(undefined)
  const [responding, setResponding] = useState(false)
  const [responded, setResponded] = useState(false)

  useEffect(() => {
    fetchRequest()
    const interval = setInterval(fetchRequest, 15000)
    return () => clearInterval(interval)
  }, [reportId])

  async function fetchRequest() {
    try {
      const res = await fetch(`${SERVER_URL}/confirmation/${reportId}`)
      const data = await res.json()
      setRequest(data ?? null)
    } catch {
      setRequest(null)
    }
  }

  async function handleResponse(status) {
    if (!request) return
    setResponding(true)
    try {
      const res = await fetch(`${SERVER_URL}/confirmation/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to respond')
      setResponded(true)
      setRequest((r) => ({ ...r, status }))
    } catch (err) {
      console.error(err)
    } finally {
      setResponding(false)
    }
  }

  if (request === undefined) return null

  // Show result after responding or if already responded
  if (responded || (request && request.status !== 'pending')) {
    const approved = request?.status === 'approved'
    return (
      <div className={`rounded-2xl px-4 py-3 text-xs flex items-start gap-2 ${
        approved
          ? 'bg-status-open-bg border border-status-open-text/20 text-status-open-text'
          : 'bg-status-rejected-bg border border-status-rejected-text/20 text-status-rejected-text'
      }`}>
        {approved
          ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
          : <XCircle size={13} className="shrink-0 mt-0.5" />
        }
        <div>
          <p className="font-semibold mb-0.5">
            {approved ? 'Proxy pickup approved.' : 'Proxy pickup denied.'}
          </p>
          <p>
            {approved
              ? 'You confirmed the proxy is authorized. The ISSC officer has been notified and will release the item.'
              : 'You denied the proxy pickup. The ISSC officer has been notified not to release the item.'}
          </p>
        </div>
      </div>
    )
  }

  if (!request) return null

  return (
    <div className="bg-status-claimed-bg border border-status-claimed-text/30 rounded-2xl p-4">
      <div className="flex items-start gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-full bg-status-claimed-text/10 flex items-center justify-center shrink-0">
          <AlertCircle size={16} className="text-status-claimed-text" />
        </div>
        <div>
          <p className="text-sm font-semibold text-status-claimed-text">
            Action required — proxy pickup
          </p>
          <p className="text-xs text-status-claimed-text/80 mt-0.5">
            Someone is at the ISSC office claiming to pick up your item on your behalf.
          </p>
        </div>
      </div>

      <div className="bg-surface-card rounded-xl px-3 py-2.5 mb-3">
        <p className="text-xs text-text-secondary mb-0.5">Person at the office:</p>
        <p className="text-sm font-semibold text-text-primary">{request.proxy_name}</p>
        <p className="text-xs text-text-muted">Student ID: {request.proxy_student_id}</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleResponse('approved')}
          disabled={responding}
          className="flex-1 h-10 rounded-xl bg-brand-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <CheckCircle2 size={14} /> Yes, authorize pickup
        </button>
        <button
          onClick={() => handleResponse('denied')}
          disabled={responding}
          className="flex-1 h-10 rounded-xl border border-status-rejected-text/30 text-status-rejected-text text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <XCircle size={14} /> No, deny pickup
        </button>
      </div>
    </div>
  )
}