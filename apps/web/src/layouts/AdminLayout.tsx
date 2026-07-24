import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Radio,
  RefreshCw,
  History,
  FolderOpen,
  LogOut,
  CalendarClock,
  User,
} from 'lucide-react';

const topModules = [
  { to: '/admin', label: 'Bureau', end: true },
  { to: '/admin/planning', label: 'Planification' },
  { to: '/admin/jobs', label: 'Historique' },
  { to: '/admin/files', label: 'Fichiers' },
  { to: '/admin/sync', label: 'Import' },
  { to: '/admin/minio', label: 'MinIO' },
  { to: '/admin/pelagic', label: 'Pelagic' },
];

const sidebarGroups = [
  {
    title: 'Bureau',
    items: [
      { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
    ],
  },
  {
    title: 'Synchronisation',
    items: [
      { to: '/admin/planning', label: 'Planification & imports', icon: CalendarClock },
      { to: '/admin/jobs', label: 'Historique détaillé', icon: History },
      { to: '/admin/sync', label: 'Import manuel', icon: RefreshCw },
      { to: '/admin/files', label: 'Fichiers stockés', icon: FolderOpen },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/admin/minio', label: 'Configuration MinIO', icon: Database },
      { to: '/admin/pelagic', label: 'Configuration Pelagic', icon: Radio },
    ],
  },
];

function pageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/admin': 'Tableau de bord',
    '/admin/planning': 'Planification & imports',
    '/admin/jobs': 'Historique détaillé',
    '/admin/files': 'Fichiers stockés',
    '/admin/sync': 'Import manuel',
    '/admin/minio': 'Configuration MinIO',
    '/admin/pelagic': 'Configuration Pelagic',
  };
  return map[pathname] || 'DATALAKE';
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = localStorage.getItem('adminUser') || 'admin';

  return (
    <div className="erp-app">
      <header className="erp-topbar">
        <div className="erp-topbar-left">
          <div className="erp-app-logo">
            <img src="/inrh-logo.svg" alt="INRH" className="erp-logo-img" />
            <div>
              <strong>DATALAKE</strong>
              <small>INRH — Données halieutiques</small>
            </div>
          </div>
          <nav className="erp-topnav">
            {topModules.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => (isActive ? 'erp-topnav-link active' : 'erp-topnav-link')}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="erp-topbar-right">
          <span className="erp-user-badge"><User size={14} /> {user}</span>
          <button
            type="button"
            className="erp-icon-btn"
            title="Déconnexion"
            onClick={() => {
              localStorage.removeItem('adminApiKey');
              navigate('/login');
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="erp-layout">
        <aside className="erp-sidebar">
          {sidebarGroups.map((group) => (
            <div key={group.title} className="erp-sidebar-group">
              <h3 className="erp-sidebar-title">{group.title}</h3>
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => (isActive ? 'erp-sidebar-link active' : 'erp-sidebar-link')}
                >
                  <Icon size={15} />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </aside>

        <main className="erp-main">
          <div className="erp-breadcrumb">
            <span>Bureau</span>
            <span className="sep">/</span>
            <strong>{pageTitle(pathname)}</strong>
          </div>
          <div className="erp-content fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
