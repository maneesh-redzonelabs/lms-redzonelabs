import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDashboardSummary, getUsersBreakdown, getTodaysSiteVisits } from '../../api/dashboard';
import { listLeads } from '../../api/leads';
import { usePermissions } from '../../auth/usePermissions';
import { useAuth } from '../../auth/AuthContext';
import { ProjectInventoryModal } from '../projects/ProjectInventoryModal';
import type { DashboardSummary, Project } from '../../api/types';

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// Order and labels mirror the prototype's LEAD_STATUSES-derived stat grid (account_admin_lms_
// desktop_v_1.4.1.html renderDashboard/renderDashboard-member). __total and __unassigned aren't
// lead statuses, so they're pulled from the summary's own totalLeads/unassignedLeads instead of
// leadsByStatus.
const STAT_FIELDS: { key: string; label: string }[] = [
  { key: '__total', label: 'Total leads' },
  { key: 'Won', label: 'Won' },
  { key: 'Site Visit Scheduled', label: 'Site visits' },
  { key: 'Follow-up', label: 'Follow-ups' },
  { key: 'Contacted', label: 'Contacted' },
  { key: 'New', label: 'New' },
  { key: '__unassigned', label: 'Unassigned' },
  { key: 'Not Reachable', label: 'Not reachable' },
  { key: 'Lost', label: 'Lost' },
  { key: 'On Hold', label: 'On hold' },
];

function LeadsStatGrid({ summary }: { summary: DashboardSummary }) {
  const values: Record<string, number> = {
    __total: summary.totalLeads,
    __unassigned: summary.unassignedLeads ?? 0,
    ...(summary.leadsByStatus ?? {}),
  };
  return (
    <div className="stat-grid">
      {STAT_FIELDS.map((f) => (
        <div className="stat-block" key={f.key}>
          <b>{values[f.key] ?? 0}</b>
          <span>{f.label}</span>
        </div>
      ))}
    </div>
  );
}

function initials(name?: string) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '—';
}

export default function Dashboard() {
  const perms = usePermissions();
  const { user } = useAuth();
  const summaryQuery = useQuery({ queryKey: ['dashboard-summary'], queryFn: getDashboardSummary });
  const breakdownQuery = useQuery({
    queryKey: ['users-breakdown'],
    queryFn: getUsersBreakdown,
    enabled: perms.canSeeKpiGrid,
  });
  const siteVisitsQuery = useQuery({ queryKey: ['todays-site-visits'], queryFn: getTodaysSiteVisits });
  const wonLeadsQuery = useQuery({
    queryKey: ['dashboard-won-leads'],
    queryFn: () => listLeads({ status: 'Won', pageSize: 4 }),
    enabled: !perms.isCompactDashboard,
  });
  const [inventoryProject, setInventoryProject] = useState<Project | null>(null);

  if (summaryQuery.isLoading) return <div className="table-empty">Loading dashboard…</div>;
  if (summaryQuery.isError) return <div className="alert alert-error">Could not load dashboard data.</div>;

  const summary = summaryQuery.data!;
  const orgName = user?.orgName || 'Your organization';
  const displayName = perms.role === 'accountadmin' ? 'Account Admin' : user?.name;

  if (perms.isCompactDashboard) {
    return (
      <div className="dashboard-compact">
        <div className="page-head">
          <div>
            <div className="eyebrow">Organization dashboard</div>
            <h1>Welcome, {displayName}</h1>
            <p>{orgName}</p>
          </div>
        </div>
        <section className="panel">
          <div className="panel-head">
            <h2>Leads summary</h2>
            <Link to="/leads" className="btn btn-sm">All leads →</Link>
          </div>
          <div className="chart-area">
            <LeadsStatGrid summary={summary} />
          </div>
        </section>
        <section className="panel">
          <div className="card-header"><h3>Today's site visits</h3></div>
          <SiteVisitsList data={siteVisitsQuery.data} />
        </section>
      </div>
    );
  }

  const projects = summary.projects ?? [];
  const availableUnits = projects.reduce((s, p) => s + (p.availableUnits ?? 0), 0);
  const heldUnits = projects.reduce((s, p) => s + (p.heldUnits ?? 0), 0);
  const soldUnits = projects.reduce((s, p) => s + (p.soldUnits ?? 0), 0);
  const activeProjectsCount = projects.filter((p) => p.status === 'Active').length;
  const planLabel = summary.subscriptionPlan
    ? summary.subscriptionPlan.charAt(0).toUpperCase() + summary.subscriptionPlan.slice(1)
    : null;
  const wonLeads = wonLeadsQuery.data?.data ?? [];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Organization dashboard</div>
          <h1>Welcome, {displayName}</h1>
          <p>{orgName}{planLabel ? ` · ${planLabel} plan` : ''}</p>
        </div>
        {perms.canManageProjects ? (
          <Link to="/projects" className="btn btn-primary"><PlusIcon /> New project</Link>
        ) : (
          <button className="btn btn-primary" disabled><PlusIcon /> New project</button>
        )}
      </div>

      <div className="metric-grid">
        <article className="metric">
          <div className="metric-label">Active team members</div>
          <div className="metric-value">{summary.activeUsers ?? 0}</div>
          <div className="metric-note">
            {summary.maxUsers != null ? `${Math.max(0, summary.maxUsers - (summary.activeUsers ?? 0))} seats available` : 'No seat limit'}
          </div>
        </article>
        <article className="metric">
          <div className="metric-label">Active projects</div>
          <div className="metric-value">{activeProjectsCount}</div>
          <div className="metric-note">
            {summary.maxProjects != null ? `${Math.max(0, summary.maxProjects - projects.length)} projects available` : 'No project limit'}
          </div>
        </article>
        <article className="metric">
          <div className="metric-label">Available inventory</div>
          <div className="metric-value">{availableUnits}</div>
          <div className="metric-note">{soldUnits} units allocated · {heldUnits} units on hold</div>
        </article>
        <article className="metric">
          <div className="metric-label">Won leads</div>
          <div className="metric-value">{summary.wonLeads}</div>
          <div className="metric-note">{Math.max(0, summary.wonLeads - soldUnits)} awaiting unit allocation</div>
        </article>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Leads summary</h2>
          <Link to="/leads" className="btn btn-sm">All leads →</Link>
        </div>
        <div className="chart-area">
          <LeadsStatGrid summary={summary} />
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Project inventory</h2>
            <Link to="/projects" className="btn btn-sm">All projects →</Link>
          </div>
          <div className="chart-area">
            <div className="dash-project-cards">
              {projects.slice(0, 3).map((p) => (
                <article className="dash-project-card" key={p.id}>
                  <h3>{p.name}</h3>
                  <p>{p.location || p.type}</p>
                  <div className="inventory-summary">
                    <span><b>{p.availableUnits ?? 0}</b> available</span>
                    <span><b>{p.soldUnits ?? 0}</b> allocated</span>
                    <span><b>{p.heldUnits ?? 0}</b> on hold</span>
                  </div>
                  <div className="card-actions">
                    <button className="btn btn-sm" disabled={perms.isCompactDashboard} onClick={() => setInventoryProject(p)}>
                      {perms.canManageProjects ? 'Manage inventory' : 'View inventory'}
                    </button>
                  </div>
                </article>
              ))}
              {!projects.length && <div className="empty-state">No projects yet.</div>}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Won leads to follow through</h2>
            {perms.canAllocateUnits ? (
              <Link to="/allocations" className="btn btn-sm">Allocate units →</Link>
            ) : (
              <button className="btn btn-sm" disabled>Allocate units →</button>
            )}
          </div>
          <div className="activity-list">
            {wonLeads.map((lead) => (
              <div className="lead-allocation-card" key={lead.id}>
                <div className="lead-avatar">{initials(lead.name)}</div>
                <div className="lead-card-info">
                  <b>{lead.name}</b>
                  <small>{lead.projectName || 'No project'}</small>
                </div>
                <span className="unit-state">Won</span>
              </div>
            ))}
            {!wonLeads.length && <div className="empty-state">No won leads yet.</div>}
          </div>
        </section>
      </div>

      <div className="quick-row">
        <button className="quick" disabled={!perms.canManageUsers} onClick={() => (window.location.href = '/users')}>
          <span className="quick-icon">U</span>
          <span><b>Manage team</b><small>Create or update organization users</small></span>
        </button>
        <button className="quick" disabled={!perms.canManageProjects} onClick={() => (window.location.href = '/projects')}>
          <span className="quick-icon">P</span>
          <span><b>Create a project</b><small>Set up apartment or plot inventory</small></span>
        </button>
        <button className="quick" disabled={!perms.canAllocateUnits} onClick={() => (window.location.href = '/allocations')}>
          <span className="quick-icon">A</span>
          <span><b>Allocate units</b><small>Match won leads to available units</small></span>
        </button>
      </div>

      {perms.canSeeKpiGrid && (
        <div className="card">
          <div className="card-header"><h3>Team performance</h3></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>User</th><th>Total leads</th><th>Open</th><th>Won</th></tr>
              </thead>
              <tbody>
                {(breakdownQuery.data ?? []).map((row) => (
                  <tr key={row.userId}>
                    <td>{row.userName}</td>
                    <td>{row.totalLeads}</td>
                    <td>{row.openLeads}</td>
                    <td>{row.wonLeads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Today's site visits</h3></div>
        <SiteVisitsList data={siteVisitsQuery.data} />
      </div>

      {inventoryProject && (
        <ProjectInventoryModal
          project={inventoryProject}
          readOnly={!perms.canManageProjects}
          onClose={() => setInventoryProject(null)}
        />
      )}
    </div>
  );
}

function SiteVisitsList({ data }: { data?: { leadId: string; leadName: string; projectName?: string; scheduledAt: string; ownerName?: string }[] }) {
  if (!data || !data.length) return <div className="empty-state">No site visits scheduled today.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>Lead</th><th>Project</th><th>Time</th><th>Owner</th></tr>
        </thead>
        <tbody>
          {data.map((v) => (
            <tr key={v.leadId}>
              <td>{v.leadName}</td>
              <td>{v.projectName || '-'}</td>
              <td>{new Date(v.scheduledAt).toLocaleTimeString()}</td>
              <td>{v.ownerName || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
