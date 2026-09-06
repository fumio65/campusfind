import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { AuthProvider, useAuth } from './shared/lib/AuthContext'
import AppShell from './shared/components/AppShell'
import AdminAppShell from './shared/components/admin/AdminAppShell'
import SplashScreen from './shared/components/SplashScreen'

// Minimum time to hold the branded splash screen on screen, so it's
// actually visible even when the session check resolves instantly.
const MIN_SPLASH_MS = 2000

// Auth screens
import LoginPage from './features/auth/LoginPage'
import ChangePasswordPage from './features/auth/ChangePasswordPage'

// App screens
import HomePage from './features/home/HomePage'
import ReportDetailPage from './features/reports/ReportDetailPage'
import NewReportPage from './features/reports/NewReportPage'
import EditReportPage from './features/reports/EditReportPage'
import ActivityPage from './features/activity/ActivityPage'
import ProfilePage from './features/profile/ProfilePage'
import HistoryPage from './features/history/HistoryPage'
import ClaimPage from './features/claims/ClaimPage'
import MessageThreadPage from './features/claims/MessageThreadPage'

// Admin screens
import OverviewPage from './features/admin/overview/OverviewPage'
import AdminReportsPage from './features/admin/reports/ReportsPage'
import DropoffRequestsPage from './features/admin/dropoff/DropoffRequestsPage'
import WalkInIntakePage from './features/admin/walk-in/WalkInIntakePage'
import AccountsPage from './features/admin/accounts/AccountsPage'
import BulkImportPage from './features/admin/bulk-import/BulkImportPage'
import AnalyticsPage from './features/admin/analytics/AnalyticsPage'

import './index.css'

function extractReportId(url) {
  if (!url) return null
  try {
    return new URL(url).pathname.match(/\/reports\/([^/]+)/)?.[1] ?? null
  } catch {
    return null
  }
}

function ProtectedRoutes() {
  const { session, needsPasswordChange } = useAuth()

  if (!session) return <Navigate to="/login" replace />
  if (needsPasswordChange) return <Navigate to="/change-password" replace />

  return <AppShell />
}

// Role-gated branch for /admin/* - mirrors ProtectedRoutes but also requires
// isAdmin, and (like admin/ originally did) waits for profile to arrive
// before deciding, so an admin whose profile hasn't loaded yet isn't
// flash-redirected to the student home before its role is known.
function AdminProtectedRoutes() {
  const { session, loading, isAdmin, profile } = useAuth()

  if (loading || (session && !profile)) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-page admin-theme">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <Routes>
      <Route element={<AdminAppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="dropoff" element={<DropoffRequestsPage />} />
        <Route path="walk-in" element={<WalkInIntakePage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="bulk-import" element={<BulkImportPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}

// Same auth gate as ProtectedRoutes, without AppShell's chrome (bottom nav,
// install prompt) - for full-screen pages like the message thread, where a
// persistent fixed bottom nav bar competing with an on-screen keyboard is
// exactly the problem being avoided.
function RequireAuthOnly({ children }) {
  const { session, needsPasswordChange } = useAuth()

  if (!session) return <Navigate to="/login" replace />
  if (needsPasswordChange) return <Navigate to="/change-password" replace />

  return children
}

function AppRoutes() {
  const { session, loading } = useAuth()
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const navigate = useNavigate()
  // Holds a report id from an App Link opened before login finished, so it
  // isn't lost when ProtectedRoutes bounces an unauthenticated visitor to
  // /login - resumed once a session shows up below. State (not a ref) so
  // whichever of {session, launch url} resolves last still triggers the
  // resume effect - a ref would silently miss it if getLaunchUrl() resolved
  // after the session effect had already run once and found nothing pending.
  const [pendingReportId, setPendingReportId] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS)
    return () => clearTimeout(timer)
  }, [])

  // App Links: opening a shared https://.../apps/campusfind/reports/:id link
  // while the app is installed launches it here instead of the browser -
  // pull the report id back out and route to it inside the app.
  useEffect(() => {
    // Cold start: the app was launched *by* the link, so the listener below
    // registers too late to catch it - getLaunchUrl() reads it directly.
    CapacitorApp.getLaunchUrl().then((result) => {
      const id = extractReportId(result?.url)
      if (id) setPendingReportId(id)
    })

    // Warm start: app was already running and the link was tapped again.
    // addListener returns a Promise<PluginListenerHandle>, not a handle
    // directly - awaiting it before calling remove() avoids "remove is not
    // a function" on cleanup.
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const id = extractReportId(url)
      if (id) setPendingReportId(id)
    })
    return () => { listener.then((handle) => handle.remove()) }
  }, [])

  // Resume to the pending report as soon as there's a session to view it
  // with - covers both "already logged in" and "just finished logging in".
  useEffect(() => {
    if (session && pendingReportId) {
      navigate(`/reports/${pendingReportId}`)
      setPendingReportId(null)
    }
  }, [session, pendingReportId, navigate])

  if (loading || !minTimeElapsed) return <SplashScreen />

  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route
        path="/reports/:id/messages"
        element={<RequireAuthOnly><MessageThreadPage /></RequireAuthOnly>}
      />
      <Route path="/admin/*" element={<AdminProtectedRoutes />} />
      <Route path="/*" element={<ProtectedRoutes />}>
        <Route index element={<HomePage />} />
        <Route path="reports/new" element={<NewReportPage />} />
        <Route path="reports/:id/edit" element={<EditReportPage />} />
        <Route path="reports/:id" element={<ReportDetailPage />} />
        <Route path="reports/:id/claim" element={<ClaimPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

function PublicOnlyRoute({ children }) {
  const { session, loading, isAdmin, profile } = useAuth()
  if (loading) return null
  // Keep showing the login form (rather than blanking to null, or worse,
  // navigating away) while we don't yet know the role, or while the
  // profile we just got back is a deactivated one. Navigating to "/" here
  // would briefly mount HomePage and fetch data before AuthContext's own
  // signOut() (for a deactivated account) clears the session back out -
  // this must never navigate on anything but a genuinely active session.
  if (session && (!profile || profile.status === 'deactivated')) return children
  if (session) return <Navigate to={isAdmin ? '/admin' : '/'} replace />
  return children
}