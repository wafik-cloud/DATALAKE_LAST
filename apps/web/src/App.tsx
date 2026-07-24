import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import MinioConfigPage from './pages/admin/MinioConfigPage';
import PelagicConfigPage from './pages/admin/PelagicConfigPage';
import PlanningPage from './pages/admin/PlanningPage';
import SyncPage from './pages/admin/SyncPage';
import JobsPage from './pages/admin/JobsPage';
import FilesPage from './pages/admin/FilesPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const key = localStorage.getItem('adminApiKey');
  if (!key) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
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
        <Route path="admin" element={<DashboardPage />} />
        <Route path="admin/minio" element={<MinioConfigPage />} />
        <Route path="admin/pelagic" element={<PelagicConfigPage />} />
        <Route path="admin/planning" element={<PlanningPage />} />
        <Route path="admin/sync" element={<SyncPage />} />
        <Route path="admin/jobs" element={<JobsPage />} />
        <Route path="admin/files" element={<FilesPage />} />
      </Route>
    </Routes>
  );
}
