import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function ProtectedRoutes() {
  const { session, needsPasswordChange } = useAuth()

  if (!session) return <Navigate to="/login" replace />
  if (needsPasswordChange) return <Navigate to="/change-password" replace />

  return <AppShell />
}

function AppRoutes() {
  const { loading } = useAuth()
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS)
    return () => clearTimeout(timer)
  }, [])

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