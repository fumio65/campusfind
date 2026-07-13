import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, CheckCircle2, XCircle, MessageSquare,
  Lightbulb, AlertCircle, Clock, Package, TrendingUp, TrendingDown, ChevronRight
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

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

const TYPE_CONFIG = {
  claim_submitted:              { icon: MessageSquare,  bg: 'bg-status-claimed-bg',  color: 'text-status-claimed-text',  label: 'Claim' },
  claim_approved:               { icon: CheckCircle2,   bg: 'bg-status-open-bg',     color: 'text-status-open-text',     label: 'Approved' },
  claim_rejected:               { icon: XCircle,        bg: 'bg-status-rejected-bg', color: 'text-status-rejected-text', label: 'Rejected' },
  tip_received:                 { icon: Lightbulb,      bg: 'bg-brand-50',           color: 'text-brand-600',            label: 'Tip' },
  tip_credited:                 { icon: Lightbulb,      bg: 'bg-status-open-bg',     color: 'text-status-open-text',     label: 'Tip credited' },
  reminder:                     { icon: Clock,          bg: 'bg-status-claimed-bg',  color: 'text-status-claimed-text',  label: 'Reminder' },
  pickup_confirmation_request:  { icon: AlertCircle,    bg: 'bg-status-claimed-bg',  color: 'text-status-claimed-text',  label: 'Action needed' },
  pickup_confirmation_approved: { icon: CheckCircle2,   bg: 'bg-status-open-bg',     color: 'text-status-open-text',     label: 'Approved' },
  pickup_confirmation_denied:   { icon: XCircle,        bg: 'bg-status-rejected-bg', color: 'text-status-rejected-text', label: 'Denied' },
  issc_dropoff:                 { icon: Package,        bg: 'bg-status-claimed-bg',  color: 'text-status-claimed-text',  label: 'Drop-off' },
  trust_score_increase:         { icon: TrendingUp,     bg: 'bg-status-open-bg',     color: 'text-status-open-text',     label: '+Score' },
  trust_score_decrease:         { icon: TrendingDown,   bg: 'bg-status-rejected-bg', color: 'text-status-rejected-text', label: '-Score' },
  new_report:                   { icon: Bell,           bg: 'bg-brand-50',           color: 'text-brand-600',            label: 'New report' },
}

function NotificationItem({ notification, onRead }) {
  const navigate = useNavigate()
  const { icon: Icon, bg, color, label } = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.default
  const isUnread = !notification.read

  function handleTap() {
    onRead(notification.id)
    if (notification.type === 'trust_score_increase' || notification.type === 'trust_score_decrease' || notification.type === 'tip_credited') {
      navigate('/profile')
    } else if (notification.report_id) {
      navigate(`/reports/${notification.report_id}`)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <div
        onClick={handleTap}
        className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl border cursor-pointer active:scale-[0.98] transition-all ${
          isUnread
            ? 'bg-brand-50 border-brand-200'
            : 'bg-surface-card border-border'
        }`}
      >
        {/* Icon */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
          <Icon size={18} className={color} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${bg} ${color}`}>
              {label}
            </span>
            {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-brand-600 shrink-0" />}
            <span className="text-[10px] text-text-muted ml-auto shrink-0">{timeAgo(notification.created_at)}</span>
          </div>
          <p className={`text-sm font-semibold leading-snug mb-0.5 ${isUnread ? 'text-text-primary' : 'text-text-secondary'}`}>
            {notification.title}
          </p>
          <p className="text-xs text-text-muted leading-relaxed">{notification.body}</p>
        </div>

        {/* Chevron if tappable */}
        {(notification.report_id || notification.type?.includes('trust_score') || notification.type === 'tip_credited') && (
          <ChevronRight size={14} className="text-text-muted shrink-0 mt-1" />
        )}
      </div>
    </motion.div>
  )
}

export default function ActivityPage() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) return
    fetchNotifications()

    const channelName = 'user-notifications'
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${session.user.id}` },
        () => fetchNotifications()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session?.user?.id])

  async function fetchNotifications() {
    const { data } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data ?? [])
    setLoading(false)
  }

  async function markRead(id) {
    await supabase.from('user_notifications').update({ read: true }).eq('id', id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    await supabase.from('user_notifications').update({ read: true }).eq('user_id', session.user.id).eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="min-h-screen bg-surface-page safe-top pb-28">
      <div className="bg-brand-600 px-4 pt-12 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Activity</h1>
          <p className="text-xs text-brand-200 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs text-white font-medium bg-white/20 px-3 py-1.5 rounded-full">
            Mark all read
          </button>
        )}
      </div>

      <div className="px-4 pt-4 flex flex-col gap-2">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-surface-card rounded-2xl animate-pulse" />
          ))
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center mb-4">
              <Bell size={28} className="text-text-muted" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">No notifications yet</p>
            <p className="text-xs text-text-muted max-w-[200px]">
              You'll be notified about claim updates, approvals, and more.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} onRead={markRead} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}