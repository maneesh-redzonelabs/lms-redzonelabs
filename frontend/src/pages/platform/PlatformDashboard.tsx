import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as platformApi from '../../api/platform';

export default function PlatformDashboard() {
  const tenantsQuery = useQuery({ queryKey: ['platform-tenants-summary'], queryFn: () => platformApi.listTenants({ pageSize: 1000 }) });
  const auditQuery = useQuery({ queryKey: ['audit-logs-recent'], queryFn: () => platformApi.getAuditLogs({ pageSize: 10 }) });

  const tenants = tenantsQuery.data?.data ?? [];
  const activeCount = tenants.filter((t) => t.status === 'active').length;

  return (
    <div>
      <h2>Platform dashboard</h2>
      <div className="kpi-grid">
        <div className="kpi-card accent-gold">
          <div className="kpi-label">Total organizations</div>
          <div className="kpi-value">{tenantsQuery.data?.meta.total ?? '-'}</div>
        </div>
        <div className="kpi-card accent-green">
          <div className="kpi-label">Active</div>
          <div className="kpi-value">{activeCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Recent audit log entries</h3></div>
        {auditQuery.isLoading && <div className="table-empty">Loading…</div>}
        {auditQuery.isError && <div className="alert alert-error">Could not load audit logs.</div>}
        {auditQuery.data && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Actor</th><th>Action</th><th>Entity</th><th>When</th></tr></thead>
              <tbody>
                {auditQuery.data.data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.actorName || entry.actorId || '-'}</td>
                    <td>{entry.action}</td>
                    <td>{entry.entity || '-'}</td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!auditQuery.data.data.length && <div className="table-empty">No audit entries yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
