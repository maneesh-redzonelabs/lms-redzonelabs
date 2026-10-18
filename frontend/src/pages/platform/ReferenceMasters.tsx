import React, { useState } from 'react';
import { useReferenceData } from '../../hooks/useReferenceData';
import { RefKey, refEndpoints } from '../../api/reference';

const MASTERS: { key: RefKey; label: string }[] = [
  { key: 'roles', label: 'Roles' },
  { key: 'leadStatuses', label: 'Lead statuses' },
  { key: 'projectTypes', label: 'Project types' },
  { key: 'projectStatuses', label: 'Project statuses' },
  { key: 'unitStatuses', label: 'Unit statuses' },
  { key: 'budgetRanges', label: 'Budget ranges' },
  { key: 'timelines', label: 'Timelines' },
  { key: 'industries', label: 'Industries' },
  { key: 'subscriptionPlans', label: 'Subscription plans' },
];

export default function ReferenceMasters() {
  const [active, setActive] = useState<RefKey>('leadStatuses');
  const query = useReferenceData(active);

  return (
    <div>
      <div className="card-header"><h2>Reference masters</h2></div>
      <div className="alert alert-info">
        These lookup tables are read via the backend's <code>/ref/*</code> endpoints and shown read-only here. The
        backend does not expose write endpoints for these masters in this build, so editing (if ever needed) would
        happen server-side.
      </div>

      <div className="filters-bar">
        {MASTERS.map((m) => (
          <button key={m.key} className={`btn btn-sm${active === m.key ? ' btn-primary' : ''}`} onClick={() => setActive(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h3>{MASTERS.find((m) => m.key === active)?.label}</h3><code>{refEndpoints[active]}</code></div>
        {query.isLoading && <div className="table-empty">Loading…</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Code</th><th>Label</th></tr></thead>
            <tbody>
              {(query.data ?? []).map((o) => (
                <tr key={o.code}><td>{o.code}</td><td>{o.label}</td></tr>
              ))}
            </tbody>
          </table>
          {query.data && !query.data.length && <div className="table-empty">No entries.</div>}
        </div>
      </div>
    </div>
  );
}
