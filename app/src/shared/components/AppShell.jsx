import { useEffect, useState, useRef, useCallback } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, Clock, Bell, User, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { registerPushToken } from '../lib/pushToken'

export default function AppShell() {
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const deferredPromptRef = useRef(null)

  const fetchUnread = useCallback(async () => {
    const { count } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('read', false)
    setUnreadCount(count ?? 0)
  }, [session.user.id])

  useEffect(() => {
    fetchUnread()

    const existing = supabase.getChannels().find((c) => c.topic === 'realtime:appshell-notifications')
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel('appshell-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => fetchUnread()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => fetchUnread()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchUnread])

  // Re-fetch unread count on every navigation
  useEffect(() => {
    fetchUnread()
  }, [location.pathname, fetchUnread])

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      deferredPromptRef.current = e
      setShowInstallPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Ask for notification permission and register this device for push
  // notifications (delivers via FCM when the app is backgrounded/closed).
  useEffect(() => {
    registerPushToken(session.user.id)
  }, [session.user.id])

  async function handleInstall() {
    const prompt = deferredPromptRef.current
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setShowInstallPrompt(false)
      deferredPromptRef.current = null
    }
  }

  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/history', icon: Clock, label: 'History' },
    { to: '/activity', icon: Bell, label: 'Activity' },
    { to: '/profile', icon: User, label: 'Profile' },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface-page">
      <main className="flex-1 overflow-y-auto pb-20 no-scrollbar">
        <Outlet />
      </main>

      {/* Install prompt banner */}
      {showInstallPrompt && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-brand-600 text-white px-4 py-3 flex items-center justify-between gap-3 safe-top">
          <div>
            <p className="text-sm font-semibold">Add CampusFind to Home Screen</p>
            <p className="text-xs text-brand-200">Get quick access from your home screen</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowInstallPrompt(false)}
              className="text-xs text-brand-200 px-2 py-1"
            >
              Later
            </button>
            <button
              onClick={handleInstall}
              className="text-xs font-semibold bg-white text-brand-600 px-3 py-1.5 rounded-lg"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-border safe-bottom z-20">
        <div className="flex items-center justify-around px-2 py-2">
          {/* Home */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors ${
                isActive ? 'text-brand-600' : 'text-text-muted'
              }`
            }
          >
            <Home size={22} />
            <span className="text-[10px] font-medium">Home</span>
          </NavLink>

          {/* History */}
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors ${
                isActive ? 'text-brand-600' : 'text-text-muted'
              }`
            }
          >
            <Clock size={22} />
            <span className="text-[10px] font-medium">History</span>
          </NavLink>

          {/* Center + button */}
          <button
            onClick={() => navigate('/reports/new')}
            className="flex flex-col items-center justify-center w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg -mt-5 transition-transform active:scale-95"
            aria-label="File a report"
          >
            <Plus size={26} />
          </button>

          {/* Activity */}
          <NavLink
            to="/activity"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors relative ${
                isActive ? 'text-brand-600' : 'text-text-muted'
              }`
            }
          >
            <div className="relative">
              <Bell size={22} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-status-rejected-text text-white text-[9px] font-bold flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">Activity</span>
          </NavLink>

          {/* Profile */}
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors ${
                isActive ? 'text-brand-600' : 'text-text-muted'
              }`
            }
          >
            <User size={22} />
            <span className="text-[10px] font-medium">Profile</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}