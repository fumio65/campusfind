import { NavLink, useLocation } from 'react-router-dom'
import { Home, BookOpen, PlusCircle, Bell, User } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function AppShell({ children }) {
  const location = useLocation()
  const { session } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!session?.user?.id) return
    fetchUnread()

    const channelName = 'appshell-notifications'
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'user_notifications',
        filter: `user_id=eq.${session.user.id}`
      }, () => fetchUnread())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session?.user?.id])

  async function fetchUnread() {
    const { count } = await supabase
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('read', false)
    setUnreadCount(count ?? 0)
  }

  // Mark as read when user visits Activity tab
  useEffect(() => {
    if (location.pathname === '/activity' && unreadCount > 0) {
      setUnreadCount(0)
    }
  }, [location.pathname])

  return (
    <div className="h-screen flex flex-col bg-surface-page overflow-hidden">
      <main className="flex-1 overflow-y-auto overscroll-none">
        <AnimatePresence>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="min-h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="bg-surface-card border-t border-border safe-bottom shrink-0">
        <div className="flex items-center justify-around px-2 pt-2 pb-2">

          <NavLink to="/" end className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors ${isActive ? 'text-brand-600' : 'text-text-muted'}`
          }>
            {({ isActive }) => (
              <>
                <Home size={22} />
                <span className={`text-[10px] font-medium ${isActive ? 'text-brand-600' : 'text-text-muted'}`}>Home</span>
              </>
            )}
          </NavLink>

          <NavLink to="/history" className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors ${isActive ? 'text-brand-600' : 'text-text-muted'}`
          }>
            {({ isActive }) => (
              <>
                <BookOpen size={22} />
                <span className={`text-[10px] font-medium ${isActive ? 'text-brand-600' : 'text-text-muted'}`}>History</span>
              </>
            )}
          </NavLink>

          <NavLink to="/reports/new" className="flex flex-col items-center -mt-5">
            <div className="w-14 h-14 rounded-full bg-brand-600 flex items-center justify-center shadow-lg">
              <PlusCircle size={26} className="text-white" />
            </div>
            <span className="text-[10px] text-text-muted mt-1">Report</span>
          </NavLink>

          <NavLink to="/activity" className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors relative ${isActive ? 'text-brand-600' : 'text-text-muted'}`
          }>
            {({ isActive }) => (
              <>
                <div className="relative">
                  <Bell size={22} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-status-rejected-text text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'text-brand-600' : 'text-text-muted'}`}>Activity</span>
              </>
            )}
          </NavLink>

          <NavLink to="/profile" className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors ${isActive ? 'text-brand-600' : 'text-text-muted'}`
          }>
            {({ isActive }) => (
              <>
                <User size={22} />
                <span className={`text-[10px] font-medium ${isActive ? 'text-brand-600' : 'text-text-muted'}`}>Profile</span>
              </>
            )}
          </NavLink>

        </div>
      </nav>
    </div>
  )
}