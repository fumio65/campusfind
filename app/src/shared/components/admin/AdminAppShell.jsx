import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './Sidebar'
import { pageTransition } from '../../lib/adminMotion'
import { warmAdminFunctions } from '../../lib/adminCache'

export default function AdminAppShell() {
  const location = useLocation()

  // Boot every admin Edge Function in the background on first load, so the
  // first visit to each tab doesn't wait on a cold start.
  useEffect(() => {
    warmAdminFunctions()
  }, [])

  return (
    <div className="h-screen flex bg-surface-page admin-theme">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1080px] mx-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} {...pageTransition}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
