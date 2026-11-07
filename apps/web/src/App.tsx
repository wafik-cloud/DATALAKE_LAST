import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import MinioConfigPage from './pages/admin/MinioConfigPage';
import PelagicConfigPage from './pages/admin/PelagicConfigPage';
import PlanningPage from './pages/admin/PlanningPage';
import SyncPage from './pages/admin/SyncPage';
import FilesPage from './pages/admin/FilesPage';
import QualityControlPage from './pages/admin/QualityControlPage';
import MaintenancePage from './pages/admin/MaintenancePage';

import { AuthProvider, useAuth, screenPermissions } from './lib/auth';
import AccessPage from './pages/admin/AccessPage';
import AccountPage from './pages/admin/AccountPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <div className="access-hint">Vérification de la session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && pathname !== '/admin/account') return <Navigate to="/admin/account" replace />;
  if ((screenPermissions[pathname] && !can(screenPermissions[pathname])) || (pathname === '/admin/access' && !user.isAdmin)) {
    const first = Object.keys(screenPermissions).find(p => can(screenPermissions[p]));
    return <Navigate to={first || '/admin/account'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/admin" replace />} />
        <Route path="admin/access" element={<AccessPage />} />
        <Route path="admin/account" element={<AccountPage />} />
        <Route path="admin" element={<DashboardPage />} />
        <Route path="admin/minio" element={<MinioConfigPage />} />
        <Route path="admin/pelagic" element={<PelagicConfigPage />} />
        <Route path="admin/planning" element={<PlanningPage />} />
        <Route path="admin/sync" element={<SyncPage />} />
        <Route path="admin/jobs" element={<Navigate to="/admin/planning" replace />} />
        <Route path="admin/files" element={<FilesPage />} />
        <Route path="admin/quality-control" element={<QualityControlPage />} />
        <Route path="admin/maintenance" element={<MaintenancePage />} />
      </Route>
    </Routes></AuthProvider>
  );
}
