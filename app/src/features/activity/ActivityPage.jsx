import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bell, CheckCircle2, XCircle, MessageSquare,
  Star, MapPin, Lightbulb
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import {
  useNotifications,
  refreshNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../shared/lib/repositories/notifications'
import { onSyncTrigger } from '../../shared/lib/appLifecycle'
import { timeAgo } from '../../shared/lib/timeAgo'

const EMPTY_NOTIFICATIONS = []

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

function NotificationItem({ notification, onTap }) {
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
      </div>
    </motion.div>
  )
}

export default function ActivityPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  // Reads reactively from the local cache (works offline); refreshNotifications
  // below keeps the cache in sync with Supabase whenever we're online.
  const notifications = useNotifications(session.user.id)
  const loading = notifications === undefined

  const fetchNotifications = useCallback(
    () => refreshNotifications(session.user.id),
    [session.user.id],
  )

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

    const unsubscribeSync = onSyncTrigger(fetchNotifications)

    return () => {
      supabase.removeChannel(channel)
      unsubscribeSync()
    }
  }, [fetchNotifications])

  async function handleTap(notification) {
    if (!notification.read) {
      await markNotificationRead(notification.id)
    }
    if (notification.report_id) {
      // The conversation itself lives on its own page now - these three
      // notification types go straight there instead of to a preview on
      // the report detail page.
      const messageTypes = ['new_message', 'dropoff_chosen', 'claim_approved']
      if (messageTypes.includes(notification.type)) {
        navigate(`/reports/${notification.report_id}/messages`)
        return
      }

      const hashMap = {
        claim_submitted: '#claim',
        claim_rejected:  '#claim',
        tip_submitted:   '#tips',
        tip_reply:       '#tips',
        tip_credited:    '#tips',
      }
      const hash = hashMap[notification.type] ?? ''
      const tipParam = notification.tip_id ? `?tip_id=${notification.tip_id}` : ''
      navigate(`/reports/${notification.report_id}${tipParam}${hash}`)
    }
  }

  async function markAllRead() {
    await markAllNotificationsRead(session.user.id)
  }

  const unreadCount = (notifications ?? EMPTY_NOTIFICATIONS).filter((n) => !n.read).length

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
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}