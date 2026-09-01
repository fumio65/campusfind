import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { AuthProvider, useAuth } from './shared/lib/AuthContext'
import AppShell from './shared/components/AppShell'
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
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const id = extractReportId(url)
      if (id) setPendingReportId(id)
    })
    return () => { listener.remove() }
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
  const { session } = useAuth()
  if (session) return <Navigate to="/" replace />
  return children
}