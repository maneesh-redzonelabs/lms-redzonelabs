import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as allocationsApi from '../../api/allocations';
import type { Allocation } from '../../api/types';
import { DataTable, Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

export default function Allocations() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ['allocations', { status, page }],
    queryFn: () => allocationsApi.listAllocations({ status: status || undefined, page, pageSize }),
  });

  const columns: Column<Allocation>[] = [
    { key: 'unit', header: 'Unit', render: (a) => a.unitCode || a.unitId },
    { key: 'project', header: 'Project', render: (a) => a.projectName || '-' },
    { key: 'lead', header: 'Lead', render: (a) => a.leadName || a.leadId },
    { key: 'status', header: 'Status', render: (a) => <span className="badge badge-neutral">{a.status}</span> },
    { key: 'date', header: 'Allocated on', render: (a) => a.allocatedAt ? new Date(a.allocatedAt).toLocaleDateString() : '-' },
  ];

  return (
    <div>
      <div className="card-header"><h2>Won lead allocations</h2></div>
      <div className="filters-bar">
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="allocated">Allocated</option>
          <option value="held">Held</option>
          <option value="sold">Sold</option>
        </select>
      </div>
      {query.isError && <div className="alert alert-error">Could not load allocations.</div>}
      <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} emptyMessage="No allocations found." />
      {query.data && <Pagination page={page} pageSize={pageSize} total={query.data.meta.total} onPageChange={setPage} />}
    </div>
  );
}
