import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as usersApi from '../../api/users';
import type { User } from '../../api/types';
import { DataTable, Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { useReferenceData } from '../../hooks/useReferenceData';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../api/client';
import { validateEmail, validateMobile } from '../../utils/validators';

export default function Users() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState<User | 'new' | null>(null);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ['users', { search, status, page }],
    queryFn: () => usersApi.listUsers({ search, status, page, pageSize }),
  });

  const columns: Column<User>[] = [
    { key: 'name', header: 'Name', render: (u) => u.name },
    { key: 'mobile', header: 'Mobile', render: (u) => u.mobile },
    { key: 'role', header: 'Role', render: (u) => <span className="badge badge-neutral">{u.role}</span> },
    { key: 'status', header: 'Status', render: (u) => <span className={`badge ${u.status === 'active' ? 'badge-active-status' : 'badge-inactive'}`}>{u.status}</span> },
    { key: 'actions', header: '', render: (u) => <button className="btn btn-sm" onClick={() => setEditingUser(u)}>Edit</button> },
  ];

  return (
    <div>
      <div className="card-header">
        <h2>Users</h2>
        <button className="btn btn-primary" onClick={() => setEditingUser('new')}>Add user</button>
      </div>
      <div className="filters-bar">
        <input className="input" placeholder="Search by name or mobile" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="invited">Invited</option>
        </select>
      </div>

      {query.isError && <div className="alert alert-error">Could not load users.</div>}

      <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} emptyMessage="No users found." />
      {query.data && (
        <Pagination page={page} pageSize={pageSize} total={query.data.meta.total} onPageChange={setPage} />
      )}

      {editingUser && (
        <UserFormModal
          user={editingUser === 'new' ? null : editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const roles = useReferenceData('roles');
  const managersQuery = useQuery({ queryKey: ['users-managers'], queryFn: usersApi.listManagers });

  const [form, setForm] = useState({
    name: user?.name ?? '',
    mobile: user?.mobile ?? '',
    email: user?.email ?? '',
    role: user?.role ?? '',
    reportsTo: user?.reportsTo ?? '',
    status: user?.status ?? 'active',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (user) {
        return usersApi.patchUser(user.id, {
          name: form.name,
          email: form.email || undefined,
          role: form.role,
          reportsTo: form.reportsTo || null,
          status: form.status,
        });
      }
      return usersApi.createUser({
        name: form.name,
        mobile: form.mobile,
        email: form.email || undefined,
        role: form.role,
        reportsTo: form.reportsTo || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notify(user ? 'User updated.' : 'User created.', 'success');
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_MOBILE') setError('A user with this mobile number already exists.');
        else if (err.code === 'PLAN_LIMIT_EXCEEDED') setError('Your subscription plan user limit has been reached.');
        else setError(err.message);
      } else setError('Could not save user.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      const mobileError = validateMobile(form.mobile);
      if (mobileError) {
        setError(mobileError);
        return;
      }
    }
    const emailError = validateEmail(form.email, false);
    if (emailError) {
      setError(emailError);
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal title={user ? 'Edit user' : 'Add user'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input className="input" required disabled={!!user} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label>Role</label>
            <select className="input" required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="">Select…</option>
              {(roles.data ?? []).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Reports to</label>
            <select className="input" value={form.reportsTo ?? ''} onChange={(e) => setForm({ ...form, reportsTo: e.target.value })}>
              <option value="">None</option>
              {(managersQuery.data ?? []).filter((m) => m.id !== user?.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {user && (
            <div className="field">
              <label>Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
