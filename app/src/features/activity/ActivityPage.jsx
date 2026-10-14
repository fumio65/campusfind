import { useEffect, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, CheckCircle2, XCircle, MessageSquare,
  Star, MapPin, Lightbulb, Trash2
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import {
  useNotifications,
  refreshNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../../shared/lib/repositories/notifications'
import { onSyncTrigger } from '../../shared/lib/appLifecycle'
import { timeAgo } from '../../shared/lib/timeAgo'
import { notificationTargetPath } from '../../shared/lib/notificationRoute'
import SwipeableNotificationItem from './SwipeableNotificationItem'
import UndoToast, { UNDO_WINDOW_MS } from './UndoToast'

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
  resolve_reminder:  { icon: CheckCircle2,  color: 'text-status-open-text',    bg: 'bg-status-open-bg'    },
  default:           { icon: Bell,          color: 'text-text-muted',          bg: 'bg-surface-muted'     },
}

function NotificationItem({ notification, onTap }) {
  const { icon: Icon, color, bg } = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.default
  const isUnread = !notification.read

  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${isUnread ? 'bg-brand-50' : 'bg-surface-card'}`}>
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
    </div>
  )
}

export default function ActivityPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  // Reads reactively from the local cache (works offline); refreshNotifications
  // below keeps the cache in sync with Supabase whenever we're online.
  const notifications = useNotifications(session.user.id)
  const loading = notifications === undefined

  // Swipe-to-delete state. A delete never commits immediately: confirming
  // the warning dialog moves a notification into `pendingDeletes` (hidden
  // from the list, but still in the local cache) and starts a timer; an
  // Undo toast offers to cancel it before that timer actually calls
  // deleteNotification. Only one row can be swiped open at a time.
  const [openSwipeId, setOpenSwipeId] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [pendingDeletes, setPendingDeletes] = useState([])
  const timersRef = useRef(new Map())

  // Leaving the page shouldn't silently strand a pending delete forever -
  // commit whatever's still waiting on its undo window right away.
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timeoutId, id) => {
        clearTimeout(timeoutId)
        deleteNotification(id)
      })
      timersRef.current.clear()
    }
  }, [])

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
    const path = notificationTargetPath(notification)
    if (path) navigate(path)
  }

  async function markAllRead() {
    await markAllNotificationsRead(session.user.id)
  }

  function handleRequestDelete(notification) {
    setConfirmTarget(notification)
  }

  function cancelDelete() {
    setConfirmTarget(null)
  }

  function confirmDelete() {
    const notification = confirmTarget
    setConfirmTarget(null)
    if (!notification) return

    setPendingDeletes((prev) => [...prev, { id: notification.id, notification }])

    const timeoutId = setTimeout(() => {
      timersRef.current.delete(notification.id)
      deleteNotification(notification.id)
      setPendingDeletes((prev) => prev.filter((p) => p.id !== notification.id))
    }, UNDO_WINDOW_MS)

    timersRef.current.set(notification.id, timeoutId)
  }

  function handleUndo(id) {
    const timeoutId = timersRef.current.get(id)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timersRef.current.delete(id)
    }
    setPendingDeletes((prev) => prev.filter((p) => p.id !== id))
  }

  const pendingIds = new Set(pendingDeletes.map((p) => p.id))
  const visibleNotifications = (notifications ?? EMPTY_NOTIFICATIONS).filter((n) => !pendingIds.has(n.id))
  const unreadCount = visibleNotifications.filter((n) => !n.read).length

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
        ) : visibleNotifications.length === 0 ? (
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
            <AnimatePresence initial={false}>
              {visibleNotifications.map((n) => (
                <SwipeableNotificationItem
                  key={n.id}
                  id={n.id}
                  isOpen={openSwipeId === n.id}
                  onOpenChange={setOpenSwipeId}
                  onRequestDelete={() => handleRequestDelete(n)}
                >
                  <NotificationItem notification={n} onTap={handleTap} />
                </SwipeableNotificationItem>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
          >
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-status-rejected-bg flex items-center justify-center mb-3">
                <Trash2 size={22} className="text-status-rejected-text" />
              </div>
              <h3 className="text-sm font-bold text-text-primary mb-1">
                Delete this notification?
              </h3>
              <p className="text-xs text-text-secondary">
                {confirmTarget.title}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={cancelDelete}
                className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 h-11 rounded-xl bg-status-rejected-text text-white text-sm font-semibold hover:opacity-90 transition-colors"
              >
                Yes, delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Undo toasts - stacked bottom-up, one per pending delete */}
      <div className="fixed left-0 right-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] flex flex-col-reverse gap-2 pointer-events-none">
        <AnimatePresence>
          {pendingDeletes.map(({ id, notification }) => (
            <UndoToast
              key={id}
              message={`"${notification.title}" deleted`}
              onUndo={() => handleUndo(id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
