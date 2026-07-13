import { useEffect, useState, useRef } from 'react'
import { Bell, X, MapPin, CheckCircle2, UserCheck, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const TYPE_CONFIG = {
  issc_dropoff: { icon: MapPin, color: 'text-status-claimed-text', bg: 'bg-status-claimed-bg' },
  proxy_request: { icon: UserCheck, color: 'text-brand-600', bg: 'bg-brand-50' },
  pickup_confirmation_approved: { icon: CheckCircle2, color: 'text-status-open-text', bg: 'bg-status-open-bg' },
  pickup_confirmation_denied: { icon: XCircle, color: 'text-status-rejected-text', bg: 'bg-status-rejected-bg' },
  new_report: { icon: Bell, color: 'text-brand-600', bg: 'bg-brand-50' },
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const ref = useRef(null)

  useEffect(() => {
    fetchNotifications()

    const channel = supabase
      .channel('admin-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => fetchNotifications()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchNotifications() {
    try {
      const res = await fetch(`${SERVER_URL}/notifications`)
      const data = await res.json()
      setNotifications(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  async function markAllRead() {
    await fetch(`${SERVER_URL}/notifications/read-all`, { method: 'PATCH' })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  async function markRead(id) {
    await fetch(`${SERVER_URL}/notifications/${id}/read`, { method: 'PATCH' })
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} className="text-brand-100" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-status-rejected-text text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-2 w-80 bg-surface-card rounded-xl shadow-xl border border-border z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-brand-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <p className="text-xs text-text-muted text-center py-6">Loading…</p>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <CheckCircle2 size={24} className="text-text-muted mb-2" />
                <p className="text-sm font-medium text-text-primary">All caught up</p>
                <p className="text-xs text-text-muted mt-0.5">No notifications yet.</p>
              </div>
            )}

            {notifications.map((n) => {
              const { icon: Icon, color, bg } = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.new_report
              return (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 text-left transition-colors hover:bg-surface-muted ${
                    !n.read ? 'bg-brand-50/40' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon size={15} className={color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-semibold ${!n.read ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-text-muted mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}