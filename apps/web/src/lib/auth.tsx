import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
export type User = { id: string; login: string; name: string; email: string; active: boolean; isAdmin: boolean; permissions: string[]; mustChangePassword: boolean };
type Auth = { user: User | null; loading: boolean; refresh: () => Promise<void>; can: (p: string) => boolean };
const Context = createContext<Auth>({ user: null, loading: true, refresh: async () => {}, can: () => false });
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() { try { setUser((await api.get('/api/auth/me')).data); } catch { setUser(null); } finally { setLoading(false); } }
  useEffect(() => { localStorage.removeItem('adminApiKey'); localStorage.removeItem('adminUser'); void refresh(); }, []);
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [user?.id]);
  return <Context.Provider value={{ user, loading, refresh, can: p => Boolean(user && (user.isAdmin || user.permissions.includes(p))) }}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
export const screenPermissions: Record<string, string> = {
  '/admin': 'dashboard', '/admin/planning': 'planning', '/admin/jobs': 'jobs', '/admin/files': 'files', '/admin/quality-control': 'quality', '/admin/sync': 'sync', '/admin/minio': 'minio', '/admin/pelagic': 'pelagic', '/admin/maintenance': 'maintenance',
};
export function Can({ permission, children }: { permission: string; children: React.ReactNode }) { return useAuth().can(permission) ? <>{children}</> : null; }
