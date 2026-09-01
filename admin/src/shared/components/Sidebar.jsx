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
import sealSrc from '../../assets/icon-only.png'
import { supabase } from '../lib/supabaseClient'
import NotificationBell from './NotificationBell'

// ── Nav groups ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: null, // no section label for top-level
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/reports',  label: 'Reports',           icon: ListChecks    },
      { to: '/dropoff',  label: 'Drop-off Requests', icon: PackageCheck  },
      { to: '/walk-in',  label: 'Walk-in Item',      icon: PersonStanding },
    ],
  },
  {
    label: 'Accounts',
    items: [
      { to: '/accounts',    label: 'Accounts',     icon: Users   },
      { to: '/bulk-import', label: 'Bulk import',  icon: Upload  },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
]

// ── Nav item ──────────────────────────────────────────────────────────────────
function NavItem({ to, label, icon: Icon, end }) {
  const location = useLocation()
  const isActive = end ? location.pathname === to : location.pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      end={end}
      className="relative flex items-center gap-2.5 px-4 py-2 mx-2 rounded-lg text-sm group"
    >
      {/* Active background */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 bg-white/15 rounded-lg"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}

      {/* Hover background — only on inactive items */}
      {!isActive && (
        <motion.div
          className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/8 transition-colors duration-150"
        />
      )}

      <Icon
        size={16}
        aria-hidden="true"
        className={`relative z-10 transition-transform duration-150 group-hover:scale-110 ${
          isActive ? 'text-white' : 'text-brand-100 group-hover:text-white'
        }`}
      />
      <span
        className={`relative z-10 transition-colors duration-150 ${
          isActive ? 'text-white font-semibold' : 'text-brand-100 group-hover:text-white'
        }`}
      >
        {label}
      </span>
    </NavLink>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
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

        {/* Logo / header */}
        <div className="flex items-center gap-2 px-5 pb-5 mb-3 border-b border-white/15">
          <img src={sealSrc} alt="" className="w-7 h-7 rounded-full object-cover" />
          <span className="text-sm font-bold flex-1">CampusFind admin</span>
          <NotificationBell />
        </div>

        {/* Nav groups */}
        <nav className="flex flex-col flex-1 gap-5 px-0">
          {NAV_GROUPS.map((group) => (
            <div key={group.label ?? '__top'}>
              {group.label && (
                <p className="px-6 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-2 pt-3 mt-3 border-t border-white/15">
          <motion.button
            onClick={() => setShowSignOutConfirm(true)}
            whileHover={{ x: 2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-brand-100 hover:bg-white/8 hover:text-white transition-colors text-sm group"
          >
            <LogOut
              size={16}
              aria-hidden="true"
              className="transition-transform duration-150 group-hover:scale-110"
            />
            <span>Sign out</span>
          </motion.button>
        </div>

      </aside>
    </>
  )
}