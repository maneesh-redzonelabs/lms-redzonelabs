import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as usersApi from '../../api/users';
import type { User } from '../../api/types';
import { DataTable, Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { useReferenceData } from '../../hooks/useReferenceData';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { validateEmail, validateMobile } from '../../utils/validators';

// Short display labels, matching the prototype's roleName() exactly — the reference data's own
// `label` is the role's long description (e.g. "Manages assigned team and team leads."), not a
// name fit for a table column or a dropdown option.
const ROLE_LABELS: Record<string, string> = {
  accountadmin: 'Admin',
  owner: 'Owner',
  manager: 'Manager',
  member: 'Team Member',
};

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="m16 4 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z" />
  </svg>
);

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Users() {
  const { user: currentUser } = useAuth();
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
    { key: 'name', header: 'User', render: (u) => <div className="main-cell">{u.name}</div> },
    { key: 'mobile', header: 'Mobile', render: (u) => u.mobile },
    { key: 'email', header: 'Email', render: (u) => u.email || '—' },
    { key: 'userType', header: 'User Type', render: (u) => u.userType || 'Internal' },
    { key: 'role', header: 'Role', render: (u) => ROLE_LABELS[u.role] || u.role },
    { key: 'reportsTo', header: 'Reports to', render: (u) => u.reportsToName || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <span className={`pill${u.status === 'active' ? '' : ' neutral'}`}>
          <i className="pill-dot" />{u.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { key: 'createdAt', header: 'Added', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (u) => (
        <div className="row-actions">
          <button className="small-button" aria-label={`Edit ${u.name}`} title={`Edit ${u.name}`} onClick={() => setEditingUser(u)}>
            <EditIcon />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Organization team</div>
          <h1>User management</h1>
          <p>Create and manage users for {currentUser?.orgName || 'your organization'}.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditingUser('new')}><PlusIcon /> Add user</button>
      </div>

      <section className="panel">
        <div className="table-toolbar">
          <label className="search">
            <SearchIcon />
            <input
              placeholder="Search name, role or mobile"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </label>
          <select className="select-small" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All users</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <span className="table-meta">{query.data?.meta.total ?? 0} users</span>
        </div>

        {query.isError && <div className="alert alert-error">Could not load users.</div>}

        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} emptyMessage="No team users match these filters." />
        {query.data && (
          <Pagination page={page} pageSize={pageSize} total={query.data.meta.total} onPageChange={setPage} />
        )}
      </section>

      {editingUser && (
        <UserFormModal
          user={editingUser === 'new' ? null : editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

function managerOptionsForRole(role: string, managers: User[]) {
  if (role === 'manager') return managers.filter((m) => m.role === 'owner');
  if (role === 'member') return managers.filter((m) => m.role === 'manager');
  return [];
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
    userType: user?.userType ?? 'Internal',
    companyName: user?.companyName ?? '',
    role: (user?.role ?? 'member') as string,
    reportsTo: user?.reportsTo ?? '',
    status: user?.status ?? 'active',
    initialPassword: '',
  });
  const [error, setError] = useState<string | null>(null);

  const isTopLevel = form.role === 'owner' || form.role === 'accountadmin';
  const managerOptions = managerOptionsForRole(form.role, (managersQuery.data ?? []).filter((m) => m.id !== user?.id));

  const mutation = useMutation({
    mutationFn: async () => {
      const companyName = form.userType === 'External' ? form.companyName : undefined;
      if (user) {
        return usersApi.patchUser(user.id, {
          name: form.name,
          email: form.email || undefined,
          userType: form.userType as 'Internal' | 'External',
          companyName,
          // The role select can show "Admin" (accountadmin) for display when editing the
          // organization's admin, but the backend never accepts accountadmin as a settable
          // role (ref_roles' only assignable roles here are owner/manager/member) — only send
          // it when it actually changed, so re-saving an admin's own record doesn't fail.
          role: form.role !== user.role ? form.role : undefined,
          reportsTo: isTopLevel ? null : (form.reportsTo || null),
          status: form.status,
        });
      }
      return usersApi.createUser({
        name: form.name,
        mobile: form.mobile,
        email: form.email || undefined,
        userType: form.userType as 'Internal' | 'External',
        companyName,
        role: form.role,
        reportsTo: isTopLevel ? null : (form.reportsTo || null),
        initialPassword: form.initialPassword || undefined,
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
    if (form.userType === 'External' && !form.companyName.trim()) {
      setError('Company name is required for External users.');
      return;
    }
    if (!isTopLevel && !form.reportsTo) {
      setError(`Select the ${form.role === 'manager' ? 'owner' : 'manager'} this user reports to.`);
      return;
    }
    if (!user && form.initialPassword.length < 8) {
      setError('Initial password must be at least 8 characters.');
      return;
    }
    setError(null);
    mutation.mutate();
  }

  const roleOptions = (roles.data ?? []).filter((r) => r.code !== 'platformadmin' && r.code !== 'accountadmin');

  return (
    <Modal title={user ? 'Edit user' : 'Create user'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="user-form-grid">
          <div className="section-label">User information</div>
          <label className="form-field">
            <span>Full name *</span>
            <input maxLength={100} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="form-field">
            <span>Mobile number *</span>
            <input maxLength={10} inputMode="numeric" required disabled={!!user} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </label>
          <label className="form-field">
            <span>Email</span>
            <input type="email" maxLength={100} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="form-field">
            <span>User Type *</span>
            <select value={form.userType} onChange={(e) => setForm({ ...form, userType: e.target.value as 'Internal' | 'External' })}>
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
          </label>
          {form.userType === 'External' && (
            <label className="form-field">
              <span>Company name *</span>
              <input maxLength={150} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </label>
          )}
          <label className="form-field">
            <span>Role *</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value, reportsTo: '' })}
            >
              {user?.role === 'accountadmin' && <option value="accountadmin">Admin</option>}
              {roleOptions.map((r) => (
                <option key={r.code} value={r.code}>{ROLE_LABELS[r.code] || r.label}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>{isTopLevel ? 'Reports to manager' : 'Reports to manager *'}</span>
            <select
              disabled={isTopLevel}
              required={!isTopLevel}
              value={isTopLevel ? '' : form.reportsTo}
              onChange={(e) => setForm({ ...form, reportsTo: e.target.value })}
            >
              <option value="">Select manager</option>
              {managerOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          {user ? (
            <label className="form-field">
              <span>Account status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          ) : (
            <label className="form-field">
              <span>Initial password *</span>
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                value={form.initialPassword}
                onChange={(e) => setForm({ ...form, initialPassword: e.target.value })}
              />
              <small className="form-note">At least 8 characters. Share this with the user out of band.</small>
            </label>
          )}
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : user ? 'Save user' : 'Create user'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
