import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Upload, ListChecks,
  PersonStanding, BarChart3, Users, LogOut,
} from 'lucide-react'
import sealSrc from '../../assets/nwssu-seal.png'
import { supabase } from '../lib/supabaseClient'
import NotificationBell from './NotificationBell'

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/bulk-import', label: 'Bulk import', icon: Upload },
  { to: '/reports', label: 'Reports', icon: ListChecks },
  { to: '/walk-in', label: 'Walk-in intake', icon: PersonStanding },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/accounts', label: 'Accounts', icon: Users },
]

export default function Sidebar() {
  const location = useLocation()

  return (
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
          onClick={() => supabase.auth.signOut()}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-brand-100 hover:bg-white/10 transition-colors text-sm"
        >
          <LogOut size={17} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}