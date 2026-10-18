import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as leadsApi from '../../api/leads';
import type { Lead } from '../../api/types';
import { DataTable, Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { useReferenceData } from '../../hooks/useReferenceData';
import { usePermissions } from '../../auth/usePermissions';
import { LeadFormModal } from './LeadFormModal';
import { LeadDetailModal } from './LeadDetailModal';
import { BulkImportModal } from './BulkImportModal';

const statusBadgeClass: Record<string, string> = {
  Won: 'badge-won',
  Lost: 'badge-lost',
  New: 'badge-new',
};

export default function Leads() {
  const perms = usePermissions();
  const statuses = useReferenceData('leadStatuses');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['leads', { status, search, page }],
    queryFn: () => leadsApi.listLeads({ status: status || undefined, search: search || undefined, page, pageSize, sort: '-createdAt' }),
  });

  const columns: Column<Lead>[] = [
    { key: 'name', header: 'Name', render: (l) => <button className="btn-link" onClick={() => setSelectedLeadId(l.id)}>{l.name}</button> },
    { key: 'mobile', header: 'Mobile', render: (l) => l.mobile },
    { key: 'project', header: 'Project', render: (l) => l.projectName || '-' },
    { key: 'status', header: 'Status', render: (l) => <span className={`badge ${statusBadgeClass[l.status] || 'badge-neutral'}`}>{l.status}</span> },
    { key: 'owner', header: 'Owner', render: (l) => l.ownerName || '-' },
    { key: 'created', header: 'Created', render: (l) => l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '-' },
  ];

  return (
    <div>
      <div className="card-header">
        <h2>Leads</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {perms.canBulkImportLeads && (
            <button className="btn" onClick={() => setShowImport(true)}>Upload leads</button>
          )}
          {perms.canCreateLeads && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Add lead</button>
          )}
        </div>
      </div>

      <div className="filters-bar">
        <input className="input" placeholder="Search name / mobile" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {(statuses.data ?? []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
      </div>

      {query.isError && <div className="alert alert-error">Could not load leads.</div>}

      <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} emptyMessage="No leads found." />
      {query.data && <Pagination page={page} pageSize={pageSize} total={query.data.meta.total} onPageChange={setPage} />}

      {showCreate && <LeadFormModal onClose={() => setShowCreate(false)} />}
      {showImport && <BulkImportModal onClose={() => setShowImport(false)} />}
      {selectedLeadId && <LeadDetailModal leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />}
    </div>
  );
}
