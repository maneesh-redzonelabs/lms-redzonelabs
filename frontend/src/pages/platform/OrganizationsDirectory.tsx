import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import * as platformApi from '../../api/platform';
import type { Org } from '../../api/types';
import { DataTable, Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../api/client';

export default function OrganizationsDirectory() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ['platform-tenants', { search, status, page }],
    queryFn: () => platformApi.listTenants({ search: search || undefined, status: status || undefined, page, pageSize }),
  });

  const impersonateMutation = useMutation({
    mutationFn: (orgId: string) => platformApi.impersonateTenant(orgId),
    onSuccess: async (result) => {
      await loginWithToken(result.token);
      notify('Signed in as account admin.', 'success');
      navigate('/dashboard');
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Could not impersonate organization.', 'error'),
  });

  const columns: Column<Org>[] = [
    { key: 'name', header: 'Organization', render: (o) => <button className="btn-link" onClick={() => setEditingOrg(o)}>{o.name}</button> },
    { key: 'slug', header: 'Slug', render: (o) => o.slug },
    { key: 'plan', header: 'Plan', render: (o) => o.subscriptionPlan || '-' },
    { key: 'users', header: 'Users', render: (o) => `${o.usersCount ?? '-'} / ${o.usersMax ?? '-'}` },
    { key: 'status', header: 'Status', render: (o) => <span className={`badge ${o.status === 'active' ? 'badge-active-status' : 'badge-inactive'}`}>{o.status || '-'}</span> },
    {
      key: 'actions',
      header: '',
      render: (o) => (
        <button className="btn btn-sm" disabled={impersonateMutation.isPending} onClick={() => impersonateMutation.mutate(o.id)}>
          Enter as Account Admin
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="card-header">
        <h2>Organizations</h2>
        <Link to="/signup" className="btn btn-primary">Onboard new organization</Link>
      </div>

      <div className="filters-bar">
        <input className="input" placeholder="Search organizations" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {query.isError && <div className="alert alert-error">Could not load organizations.</div>}
      <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} emptyMessage="No organizations found." />
      {query.data && <Pagination page={page} pageSize={pageSize} total={query.data.meta.total} onPageChange={setPage} />}

      {editingOrg && (
        <EditOrgModal org={editingOrg} onClose={() => setEditingOrg(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })} />
      )}
    </div>
  );
}

function EditOrgModal({ org, onClose, onSaved }: { org: Org; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [status, setStatus] = useState(org.status || 'active');
  const [usersMax, setUsersMax] = useState(org.usersMax ?? 0);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => platformApi.patchTenant(org.id, { status, usersMax }),
    onSuccess: () => { notify('Organization updated.', 'success'); onSaved(); onClose(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not update organization.'),
  });

  return (
    <Modal title={org.name} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <div className="form-grid">
          <div className="field">
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div className="field">
            <label>Max users</label>
            <input className="input" type="number" min={0} value={usersMax} onChange={(e) => setUsersMax(Number(e.target.value))} />
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
