import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./shared/lib/AuthContext";
import AppShell from "./shared/components/AppShell";
import AdminLoginPage from "./features/auth/LoginPage";
import OverviewPage from "./features/overview/OverviewPage";
import BulkImportPage from "./features/bulk-import/BulkImportPage";
import ReportsPage from "./features/reports/ReportsPage";
import WalkInIntakePage from "./features/walk-in/WalkInIntakePage";
import AnalyticsPage from "./features/analytics/AnalyticsPage";
import AccountsPage from "./features/accounts/AccountsPage";

function ProtectedRoutes() {
  const { session, loading, isAdmin, profile } = useAuth();

  if (loading || (session && !profile)) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-page">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !isAdmin) return <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="bulk-import" element={<BulkImportPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="walk-in" element={<WalkInIntakePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function PublicOnlyRoute({ children }) {
  const { session, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (session && isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <AdminLoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
