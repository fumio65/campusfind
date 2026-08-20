import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bell, CheckCircle2, XCircle, MessageSquare,
  Star, MapPin, Trash2, Lightbulb
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const TYPE_CONFIG = {
  claim_submitted:   { icon: MessageSquare, color: 'text-status-claimed-text', bg: 'bg-status-claimed-bg' },
  claim_approved:    { icon: CheckCircle2,  color: 'text-status-open-text',    bg: 'bg-status-open-bg'    },
  claim_rejected:    { icon: XCircle,       color: 'text-status-rejected-text',bg: 'bg-status-rejected-bg'},
  tip_credited:      { icon: Star,          color: 'text-status-open-text',    bg: 'bg-status-open-bg'    },
  tip_submitted:     { icon: Lightbulb,     color: 'text-status-claimed-text', bg: 'bg-status-claimed-bg' },
  tip_reply:         { icon: Lightbulb,     color: 'text-brand-600',           bg: 'bg-brand-50'          },
  walkin_registered: { icon: MapPin,        color: 'text-brand-600',           bg: 'bg-brand-50'          },
  new_message:       { icon: MessageSquare, color: 'text-brand-600',           bg: 'bg-brand-50'          },
  dropoff_chosen:    { icon: MapPin,        color: 'text-status-claimed-text', bg: 'bg-status-claimed-bg' },
  new_report:        { icon: Bell,          color: 'text-brand-600',           bg: 'bg-brand-50'          },
  default:           { icon: Bell,          color: 'text-text-muted',          bg: 'bg-surface-muted'     },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function NotificationItem({ notification, onTap, onDelete }) {
  const { icon: Icon, color, bg } = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.default
  const isUnread = !notification.read

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 transition-colors ${
        isUnread ? 'bg-brand-50' : 'bg-surface-card'
      }`}
    >
      <div className={`w-9 h-9 rounded-full ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={16} className={color} />
      </div>

      <button
        onClick={() => onTap(notification)}
        className="flex-1 min-w-0 text-left"
      >
        <p className={`text-sm leading-snug truncate ${isUnread ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed line-clamp-1">
          {notification.body}
        </p>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {isUnread && <div className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
        <p className="text-[10px] text-text-muted whitespace-nowrap">{timeAgo(notification.created_at)}</p>
        <button
          onClick={() => onDelete(notification.id)}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-muted transition-colors"
          aria-label="Delete notification"
        >
          <Trash2 size={13} className="text-text-muted" />
        </button>
      </div>
    </motion.div>
  )
}

export default function ActivityPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data ?? [])
    setLoading(false)
  }, [session.user.id])

  useEffect(() => {
    fetchNotifications()

    const existing = supabase.getChannels().find((c) => c.topic === 'realtime:activity-page')
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel('activity-page')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => fetchNotifications()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchNotifications])

  async function handleTap(notification) {
    if (!notification.read) {
      await supabase
        .from('user_notifications')
        .update({ read: true })
        .eq('id', notification.id)
      setNotifications((prev) =>
        prev.map((n) => n.id === notification.id ? { ...n, read: true } : n)
      )
    }
    if (notification.report_id) {
      navigate(`/reports/${notification.report_id}`)
    }
  }

  async function handleDelete(id) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('user_notifications').delete().eq('id', id)
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read)
    if (!unread.length) return
    await supabase
      .from('user_notifications')
      .update({ read: true })
      .in('id', unread.map((n) => n.id))
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true }))
    )
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div
        className="bg-brand-600 px-5 pb-5 sticky top-0 z-10"
        style={{ paddingTop: 'max(3rem, env(safe-area-inset-top) + 1rem)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-bold">Activity</h1>
            <p className="text-brand-200 text-xs mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : 'Your notification feed'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs font-semibold text-white bg-white/15 px-3 py-1.5 rounded-xl hover:bg-white/25 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-5">
        {loading ? (
          <div className="bg-surface-card rounded-2xl border border-border overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
                <div className="w-9 h-9 rounded-full bg-surface-muted animate-pulse shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-3.5 bg-surface-muted rounded-full w-2/3 animate-pulse" />
                  <div className="h-3 bg-surface-muted rounded-full w-full animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center text-center py-16"
          >
            <div className="w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center mb-4">
              <Bell size={24} className="text-text-muted" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">No activity yet</p>
            <p className="text-xs text-text-muted max-w-xs">
              Notifications about your reports, claims, and tips will appear here.
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-card rounded-2xl border border-border overflow-hidden"
          >
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onTap={handleTap}
                onDelete={handleDelete}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}