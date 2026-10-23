import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as platformApi from '../../api/platform';
import type { Org } from '../../api/types';
import { DataTable, Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { useReferenceData } from '../../hooks/useReferenceData';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../api/client';
import { OnboardOrgModal } from './OnboardOrgModal';

const TIMEZONES = [
  '(GMT+5:30) India Standard Time',
  '(GMT+4:00) Gulf Standard Time',
  '(GMT+8:00) Singapore Standard Time',
  '(GMT+1:00) Central European Time',
  '(GMT-5:00) Eastern Time (US & Canada)',
];

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

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function titleCase(s?: string) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function OrganizationsDirectory() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [orgStatus, setOrgStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const [verifyingOrg, setVerifyingOrg] = useState<Org | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ['platform-tenants', { search, orgStatus, page }],
    queryFn: () => platformApi.listTenants({ search: search || undefined, orgStatus: orgStatus || undefined, page, pageSize }),
  });

  const rows = query.data?.data ?? [];

  const columns: Column<Org>[] = [
    {
      key: 'name',
      header: 'Organization',
      render: (o) => (
        <div>
          <div className="main-cell">{o.name}</div>
          <div className="subcell">{o.slug}</div>
        </div>
      ),
    },
    {
      key: 'industry',
      header: 'Industry · Country',
      render: (o) => (
        <div>
          {o.industry || '—'}
          <div className="subcell">{o.country || '—'}</div>
        </div>
      ),
    },
    { key: 'plan', header: 'Subscription Plan', render: (o) => titleCase(o.subscriptionPlan) || '—' },
    {
      key: 'orgStatus',
      header: 'Org. Status',
      render: (o) => (
        <span className={`pill${o.orgStatus === 'Active' ? '' : o.orgStatus === 'Suspended' ? ' off' : ' pending'}`}>
          <i className="pill-dot" />{o.orgStatus || 'Active'}
        </span>
      ),
    },
    { key: 'trialEndsAt', header: 'Trial Ending On', render: (o) => formatDate(o.trialEndsAt) },
    { key: 'users', header: 'Users', render: (o) => o.usersCount ?? '-' },
    { key: 'projects', header: 'Projects', render: (o) => o.activeProjects ?? '-' },
    { key: 'leads', header: 'Leads', render: (o) => (o.totalLeads ?? 0).toLocaleString('en-IN') },
    { key: 'createdAt', header: 'Created', render: (o) => formatDate(o.createdAt) },
    {
      key: 'actions',
      header: 'Action',
      render: (o) => (
        <div className="row-actions">
          <button className="small-button" title={`Edit ${o.name}`} aria-label={`Edit ${o.name}`} onClick={() => setEditingOrg(o)}>
            <EditIcon />
          </button>
          <button className="small-button" title={`Verify ${o.name}`} aria-label={`Verify ${o.name}`} onClick={() => setVerifyingOrg(o)}>
            <CheckIcon />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Tenant directory</div>
          <h1>Organizations</h1>
          <p>Provision and monitor organizations across the Lead Management platform.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOnboarding(true)}><PlusIcon /> Onboard new organization</button>
      </div>

      <section className="panel">
        <div className="table-toolbar">
          <label className="search">
            <SearchIcon />
            <input
              placeholder="Search name, slug or contact"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </label>
          <select className="select-small" value={orgStatus} onChange={(e) => { setOrgStatus(e.target.value); setPage(1); }}>
            <option value="">All Org. Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
          </select>
          <span className="table-meta">{query.data?.meta.total ?? 0} organizations</span>
        </div>

        {query.isError && <div className="alert alert-error">Could not load organizations.</div>}
        <DataTable columns={columns} rows={rows} loading={query.isLoading} emptyMessage="No organizations match these filters." />
        {query.data && <Pagination page={page} pageSize={pageSize} total={query.data.meta.total} onPageChange={setPage} />}
      </section>

      {editingOrg && (
        <EditOrgModal
          org={editingOrg}
          onClose={() => setEditingOrg(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })}
        />
      )}

      {verifyingOrg && (
        <VerifyOrgModal
          org={verifyingOrg}
          onClose={() => setVerifyingOrg(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })}
        />
      )}

      {onboarding && (
        <OnboardOrgModal
          onClose={() => setOnboarding(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })}
        />
      )}
    </div>
  );
}

// Matches the prototype's platformEditOrganization modal - Organization Name / Time Zone /
// Admin Mobile No. match exactly; "Organization Type" is replaced with this app's existing
// Industry taxonomy (ref_industries), per the earlier org-signup decision to keep Industry
// rather than introduce a parallel Organization Type concept.
function EditOrgModal({ org, onClose, onSaved }: { org: Org; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const industries = useReferenceData('industries');
  const [orgName, setOrgName] = useState(org.name);
  const [industry, setIndustry] = useState(org.industry ?? '');
  const [timezone, setTimezone] = useState(org.timezone || TIMEZONES[0]);
  const [primaryContactMobile, setPrimaryContactMobile] = useState(org.primaryContactMobile ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => platformApi.patchTenant(org.id, { orgName, industry, timezone, primaryContactMobile }),
    onSuccess: () => { notify('Organization updated.', 'success'); onSaved(); onClose(); },
    onError: (err) => {
      if (err instanceof ApiError) {
        const fieldError = (err.details as any)?.fieldErrors?.primaryContactMobile?.[0];
        setError(fieldError || err.message);
      } else setError('Could not update organization.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim() || !industry || !timezone) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!/^\d{10}$/.test(primaryContactMobile)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal title="Edit organization" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="user-form-grid">
          <label className="form-field full">
            <span>Organization Name *</span>
            <input maxLength={150} required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Industry *</span>
            <select required value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">Select…</option>
              {(industries.data ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Time Zone *</span>
            <select required value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Admin Mobile No. *</span>
            <input maxLength={10} inputMode="numeric" required value={primaryContactMobile} onChange={(e) => setPrimaryContactMobile(e.target.value)} />
          </label>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Matches the prototype's platformVerifyOrganization modal exactly - this is the only place an
// organization's Org. Status changes: Pending (just onboarded, can't sign in yet), Active (can
// sign in), Suspended (blocked, "contact your Admin").
function VerifyOrgModal({ org, onClose, onSaved }: { org: Org; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [orgStatus, setOrgStatus] = useState<'Pending' | 'Active' | 'Suspended'>(org.orgStatus ?? 'Pending');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => platformApi.patchTenant(org.id, { orgStatus }),
    onSuccess: () => { notify('Organization status updated.', 'success'); onSaved(); onClose(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not update organization status.'),
  });

  return (
    <Modal title="Verify organization status" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          Set the Org. Status for <b>{org.name}</b>. Pending and Suspended organizations cannot sign in.
          Suspended users see: "Your organization is in suspended status, contact your Admin."
        </div>
        <label className="form-field full">
          <span>Org. Status *</span>
          <select value={orgStatus} onChange={(e) => setOrgStatus(e.target.value as 'Pending' | 'Active' | 'Suspended')}>
            <option value="Pending">Pending</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
          </select>
        </label>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save status'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
