import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Upload,
  ListChecks,
  PersonStanding,
  BarChart3,
  Users,
  LogOut,
  PackageCheck,
  AlertTriangle,
} from 'lucide-react'
import sealSrc from '../../assets/nwssu-seal.png'
import { supabase } from '../lib/supabaseClient'
import NotificationBell from './NotificationBell'

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/bulk-import', label: 'Bulk import', icon: Upload },
  { to: '/reports', label: 'Reports', icon: ListChecks },
  { to: '/walk-in', label: 'Found Item Drop-off', icon: PersonStanding },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/accounts', label: 'Accounts', icon: Users },
  { to: '/dropoff', label: 'Drop-off Requests', icon: PackageCheck },
]

export default function Sidebar() {
  const location = useLocation()
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  return (
    <>
      {/* Sign out confirmation dialog */}
      <AnimatePresence>
        {showSignOutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6"
            onClick={() => setShowSignOutConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
            >
              <div className="flex flex-col items-center text-center mb-5">
                <div className="w-12 h-12 rounded-full bg-status-claimed-bg flex items-center justify-center mb-3">
                  <AlertTriangle size={22} className="text-status-claimed-text" />
                </div>
                <h3 className="text-sm font-bold text-text-primary mb-1">Sign out?</h3>
                <p className="text-xs text-text-secondary">
                  You'll need to sign back in to access the admin dashboard.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSignOutConfirm(false)}
                  className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="flex-1 h-11 rounded-xl bg-status-rejected-text text-white text-sm font-semibold hover:opacity-90 transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <aside className="w-[210px] shrink-0 bg-brand-600 text-white flex flex-col py-5">
        <div className="flex items-center gap-2 px-5 pb-5 mb-2 border-b border-white/15">
          <img src={sealSrc} alt="" className="w-7 h-7 rounded-full object-cover" />
          <span className="text-sm font-bold flex-1">CampusFind admin</span>
          <NotificationBell />
        </div>
        <nav className="flex flex-col flex-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => {
            const isActive = end ? location.pathname === to : location.pathname.startsWith(to)
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={`relative flex items-center gap-2.5 px-5 py-2.5 text-sm ${!isActive ? 'hover:text-white' : ''}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-white/10 border-r-2 border-white"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon
                  size={17}
                  aria-hidden="true"
                  className={`relative ${isActive ? 'text-white' : 'text-brand-100'}`}
                />
                <span className={`relative ${isActive ? 'text-white font-semibold' : 'text-brand-100'}`}>
                  {label}
                </span>
              </NavLink>
            )
          })}
        </nav>

        <div className="px-3 pt-3 border-t border-white/15">
          <button
            onClick={() => setShowSignOutConfirm(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-brand-100 hover:bg-white/10 transition-colors text-sm"
          >
            <LogOut size={17} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}