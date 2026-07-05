import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './shared/lib/AuthContext'
import AppShell from './shared/components/AppShell'

import LoginPage from './features/auth/LoginPage'
import ChangePasswordPage from './features/auth/ChangePasswordPage'
import HomePage from './features/home/HomePage'
import ReportDetailPage from './features/reports/ReportDetailPage'
import NewReportPage from './features/reports/NewReportPage'
import ActivityPage from './features/activity/ActivityPage'
import ProfilePage from './features/profile/ProfilePage'
import ClaimPage from './features/claims/ClaimPage'

import './index.css'

function ProtectedRoutes() {
  const { session, loading, needsPasswordChange } = useAuth()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-page">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (needsPasswordChange) return <Navigate to="/change-password" replace />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/reports/new" element={<NewReportPage />} />
        <Route path="/reports/:id" element={<ReportDetailPage />} />
        <Route path="/reports/:id/claim" element={<ClaimPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

function PublicOnlyRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}