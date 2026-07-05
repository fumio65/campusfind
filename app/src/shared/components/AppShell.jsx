import { NavLink, useLocation } from 'react-router-dom'
import { Home, PlusCircle, Bell, User } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home', exact: true },
  { to: '/activity', icon: Bell, label: 'Activity' },
  { to: null, icon: PlusCircle, label: 'Report', isFab: true },
  { to: '/profile', icon: User, label: 'Profile' },
]

export default function AppShell({ children }) {
  const location = useLocation()

  return (
    <div className="h-screen flex flex-col bg-surface-page overflow-hidden">
      <main className="flex-1 overflow-y-auto overscroll-none">
        <AnimatePresence mode="wait">
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
        <div className="flex items-center justify-around px-2 pt-2 pb-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label, isFab, exact }) => {
            if (isFab) {
              return (
                <NavLink key={label} to="/reports/new" className="flex flex-col items-center -mt-5">
                  <div className="w-14 h-14 rounded-full bg-brand-600 flex items-center justify-center shadow-lg">
                    <Icon size={26} className="text-white" aria-hidden="true" />
                  </div>
                  <span className="text-[10px] text-text-muted mt-1">{label}</span>
                </NavLink>
              )
            }
            return (
              <NavLink
                key={label}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                    isActive ? 'text-brand-600' : 'text-text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={22} aria-hidden="true" />
                    <span className={`text-[10px] font-medium ${isActive ? 'text-brand-600' : 'text-text-muted'}`}>
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}