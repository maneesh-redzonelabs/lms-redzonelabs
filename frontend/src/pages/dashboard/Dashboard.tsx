import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDashboardSummary, getUsersBreakdown, getTodaysSiteVisits } from '../../api/dashboard';
import { usePermissions } from '../../auth/usePermissions';
import { Modal } from '../../components/Modal';

export default function Dashboard() {
  const perms = usePermissions();
  const summaryQuery = useQuery({ queryKey: ['dashboard-summary'], queryFn: getDashboardSummary });
  const breakdownQuery = useQuery({
    queryKey: ['users-breakdown'],
    queryFn: getUsersBreakdown,
    enabled: perms.canSeeKpiGrid,
  });
  const siteVisitsQuery = useQuery({ queryKey: ['todays-site-visits'], queryFn: getTodaysSiteVisits });
  const [showInventory, setShowInventory] = useState(false);

  if (summaryQuery.isLoading) return <div className="table-empty">Loading dashboard…</div>;
  if (summaryQuery.isError) return <div className="alert alert-error">Could not load dashboard data.</div>;

  const summary = summaryQuery.data!;

  if (perms.isCompactDashboard) {
    return (
      <div>
        <h2>My leads summary</h2>
        <div className="kpi-grid">
          <div className="kpi-card accent-gold">
            <div className="kpi-label">Open leads</div>
            <div className="kpi-value">{summary.openLeads}</div>
          </div>
          <div className="kpi-card accent-green">
            <div className="kpi-label">Won</div>
            <div className="kpi-value">{summary.wonLeads}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Today's site visits</h3></div>
          <SiteVisitsList data={siteVisitsQuery.data} />
        </div>
        <Link to="/leads" className="btn btn-primary">Go to my leads</Link>
      </div>
    );
  }

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="kpi-grid">
        <div className="kpi-card accent-gold">
          <div className="kpi-label">Total leads</div>
          <div className="kpi-value">{summary.totalLeads}</div>
        </div>
        <div className="kpi-card accent-blue">
          <div className="kpi-label">New today</div>
          <div className="kpi-value">{summary.newLeadsToday}</div>
        </div>
        <div className="kpi-card accent-green">
          <div className="kpi-label">Won</div>
          <div className="kpi-value">{summary.wonLeads}</div>
        </div>
        <div className="kpi-card accent-red">
          <div className="kpi-label">Lost</div>
          <div className="kpi-value">{summary.lostLeads}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Open leads</div>
          <div className="kpi-value">{summary.openLeads}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Site visits today</div>
          <div className="kpi-value">{summary.siteVisitsToday}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Projects</h3>
          {perms.canManageProjects && (
            <Link to="/projects" className="btn btn-sm">Manage inventory</Link>
          )}
          {!perms.canManageProjects && perms.canViewInventoryOnly && (
            <button className="btn btn-sm" onClick={() => setShowInventory(true)}>View inventory</button>
          )}
        </div>
        <div className="project-grid">
          {(summary.projects ?? []).map((p) => (
            <div className="project-card" key={p.id}>
              <h3>{p.name}</h3>
              <p>{p.location || p.type}</p>
              <div className="project-stats">
                <span>Total: {p.totalUnits ?? '-'}</span>
                <span>Available: {p.availableUnits ?? '-'}</span>
                <span>Held: {p.heldUnits ?? '-'}</span>
                <span>Sold: {p.soldUnits ?? '-'}</span>
              </div>
            </div>
          ))}
          {!(summary.projects ?? []).length && <div className="empty-state">No projects yet.</div>}
        </div>
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

      {showInventory && !perms.canManageProjects && perms.canViewInventoryOnly && (
        <Modal title="Inventory (read-only)" onClose={() => setShowInventory(false)} wide>
          <div className="project-grid">
            {(summary.projects ?? []).map((p) => (
              <div className="project-card" key={p.id}>
                <h3>{p.name}</h3>
                <p>{p.location || p.type}</p>
                <div className="project-stats">
                  <span>Total: {p.totalUnits ?? '-'}</span>
                  <span>Available: {p.availableUnits ?? '-'}</span>
                  <span>Held: {p.heldUnits ?? '-'}</span>
                  <span>Sold: {p.soldUnits ?? '-'}</span>
                </div>
              </div>
            ))}
          </div>
        </Modal>
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
