import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../auth/usePermissions';

interface NavItem { to: string; label: string; icon: React.ReactNode; }

const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="8" height="8" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="11" width="7" height="10" rx="1" /><rect x="3" y="14" width="8" height="7" rx="1" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0114 0v2M17 11a4 4 0 100-8m5 18v-2a7 7 0 00-4-6.3" />
    </svg>
  ),
  projects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1m4 0h1m-6 4h1m4 0h1m-5 7v-4h4v4" />
    </svg>
  ),
  leads: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0114 0v2M17 11a4 4 0 100-8m5 18v-2a7 7 0 00-4-6.3" />
    </svg>
  ),
  allocations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h16M4 12h16M4 19h10" /><circle cx="18" cy="18" r="3" />
    </svg>
  ),
  orgchart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="12" r="2" />
      <circle cx="6" cy="19" r="2" /><circle cx="18" cy="19" r="2" />
      <path d="M12 7v2M12 9l-6 1M12 9l6 1M6 14v3M18 14v3" />
    </svg>
  ),
  orgs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 21V7l6-4 6 4v14M4 21h16M9 9h.01M13 9h.01M9 13h.01M13 13h.01M9 17h.01M13 17h.01" />
    </svg>
  ),
  ref: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
    </svg>
  ),
};

function NavButton({ to, label, icon }: NavItem) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
      {icon}
      <span className="nav-text">{label}</span>
    </NavLink>
  );
}

export function AppShell({ platform }: { platform?: boolean }) {
  const { user, logout } = useAuth();
  const perms = usePermissions();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const orgNavItems: NavItem[] = [{ to: '/dashboard', label: 'Dashboard', icon: Icon.dashboard }];
  if (perms.canManageUsers) orgNavItems.push({ to: '/users', label: 'Users', icon: Icon.users });
  if (perms.canSeeProjectsNav) orgNavItems.push({ to: '/projects', label: 'Projects & inventory', icon: Icon.projects });

  const platformNavItems: NavItem[] = [
    { to: '/platform', label: 'Dashboard', icon: Icon.dashboard },
    { to: '/platform/organizations', label: 'Organizations', icon: Icon.orgs },
    { to: '/platform/reference', label: 'Reference masters', icon: Icon.ref },
  ];

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="side-brand">
          <div className="brand-logo-frame">
            {!platform && user?.orgLogoUrl ? (
              <img className="brand-logo" src={user.orgLogoUrl} alt={`${user.orgName || 'Organization'} logo`} />
            ) : (
              <svg width="26" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a7440" strokeWidth="2">
                <path d="M3 21h18M5 21V7l7-4 7 4v14" />
              </svg>
            )}
          </div>
          <div className="side-brand-copy">
            <div className="side-brand-name">{platform ? 'RedZone Labs' : (user?.orgName || 'Account Console')}</div>
            <div className="side-brand-sub">{platform ? 'Platform Admin' : 'Account Console'}</div>
          </div>
        </div>

        {!platform && (
          <>
            <div className="nav-label">Organization</div>
            <nav className="nav" aria-label="Organization navigation">
              {orgNavItems.map((item) => <NavButton key={item.to} {...item} />)}
            </nav>
            <div className="nav-group nav">
              <div className="nav-label">CRM</div>
              <NavButton to="/leads" label="Leads" icon={Icon.leads} />
              <NavButton to="/allocations" label="Won lead allocations" icon={Icon.allocations} />
            </div>
            <div className="nav-group nav">
              <div className="nav-label">Insights</div>
              <NavButton to="/org-hierarchy" label="Org hierarchy" icon={Icon.orgchart} />
            </div>
          </>
        )}

        {platform && (
          <nav className="nav" aria-label="Platform navigation">
            {platformNavItems.map((item) => <NavButton key={item.to} {...item} />)}
          </nav>
        )}

        <div className="sidebar-bottom">
          <b>{user?.name}</b>
          <span>{user?.role}</span>
        </div>
        <button className="btn logout-btn" onClick={handleLogout}>Log out</button>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle navigation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="topbar-title">{platform ? 'Platform Admin Console' : 'Lead Management Console'}</div>
          <div className="topbar-right">
            <span>{user?.name}</span>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
