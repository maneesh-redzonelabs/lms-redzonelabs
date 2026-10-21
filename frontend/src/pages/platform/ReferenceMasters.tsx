import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useReferenceData } from '../../hooks/useReferenceData';
import { RefKey, refEndpoints, REF_ID_FIELD, RefRow, createRefItem, updateRefItem } from '../../api/reference';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../api/client';

type FieldType = 'text' | 'number' | 'checkbox' | 'select' | 'color';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
}

const MASTERS: { key: RefKey; label: string; fields: FieldDef[] }[] = [
  {
    key: 'roles',
    label: 'Roles',
    fields: [
      { key: 'roleName', label: 'Role name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'canCreateUsers', label: 'Can create users', type: 'checkbox' },
      { key: 'canCreateProjects', label: 'Can create projects', type: 'checkbox' },
      { key: 'viewScope', label: 'Lead visibility scope', type: 'select', options: ['own', 'team', 'all'], required: true },
    ],
  },
  {
    key: 'leadStatuses',
    label: 'Lead statuses',
    fields: [
      { key: 'statusName', label: 'Status name', type: 'text', required: true },
      { key: 'isTerminal', label: 'Terminal status', type: 'checkbox' },
      { key: 'colourHex', label: 'Badge colour', type: 'color' },
      { key: 'sortOrder', label: 'Display order', type: 'number', required: true },
    ],
  },
  {
    key: 'projectTypes',
    label: 'Project types',
    fields: [{ key: 'typeName', label: 'Type name', type: 'text', required: true }],
  },
  {
    key: 'projectStatuses',
    label: 'Project statuses',
    fields: [{ key: 'statusName', label: 'Status name', type: 'text', required: true }],
  },
  {
    key: 'unitStatuses',
    label: 'Unit statuses',
    fields: [{ key: 'statusName', label: 'Status name', type: 'text', required: true }],
  },
  {
    key: 'budgetRanges',
    label: 'Budget ranges',
    fields: [
      { key: 'label', label: 'Range label', type: 'text', required: true },
      { key: 'minValue', label: 'Minimum value (INR)', type: 'number', required: true },
      { key: 'maxValue', label: 'Maximum value (INR)', type: 'number' },
      { key: 'sortOrder', label: 'Display order', type: 'number', required: true },
    ],
  },
  {
    key: 'timelines',
    label: 'Timelines',
    fields: [
      { key: 'label', label: 'Timeline label', type: 'text', required: true },
      { key: 'daysMax', label: 'Maximum days', type: 'number' },
      { key: 'sortOrder', label: 'Display order', type: 'number', required: true },
    ],
  },
  {
    key: 'industries',
    label: 'Industries',
    fields: [
      { key: 'industryName', label: 'Industry name', type: 'text', required: true },
      { key: 'isActive', label: 'Available for selection', type: 'checkbox' },
      { key: 'sortOrder', label: 'Display order', type: 'number', required: true },
    ],
  },
  {
    key: 'subscriptionPlans',
    label: 'Subscription plans',
    fields: [
      { key: 'planName', label: 'Plan key', type: 'select', options: ['trial', 'starter', 'professional', 'enterprise'], required: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'pricePerUser', label: 'Price per user / month (INR)', type: 'number', required: true },
      { key: 'maxUsers', label: 'Maximum users', type: 'number', required: true },
      { key: 'maxProjects', label: 'Maximum projects', type: 'number', required: true },
      { key: 'isActive', label: 'Available for selection', type: 'checkbox' },
      { key: 'sortOrder', label: 'Display order', type: 'number', required: true },
    ],
  },
];

export default function ReferenceMasters() {
  const [active, setActive] = useState<RefKey>('leadStatuses');
  const [editing, setEditing] = useState<RefRow | null | 'new'>(null);
  const query = useReferenceData(active);
  const master = MASTERS.find((m) => m.key === active)!;

  return (
    <div>
      <div className="card-header">
        <h2>Reference masters</h2>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          Add {master.label.replace(/s$/, '')}
        </button>
      </div>
      <div className="alert alert-info">
        These lookup tables are shared platform-wide configuration, read via the backend's <code>/ref/*</code> endpoints.
        Changes made here affect every organization.
      </div>

      <div className="filters-bar">
        {MASTERS.map((m) => (
          <button key={m.key} className={`btn btn-sm${active === m.key ? ' btn-primary' : ''}`} onClick={() => setActive(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h3>{master.label}</h3><code>{refEndpoints[active]}</code></div>
        {query.isLoading && <div className="table-empty">Loading…</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Label</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((o) => (
                <tr key={o.code}>
                  <td>{o.code}</td>
                  <td>{o.label}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => setEditing(o)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.data && !query.data.length && <div className="table-empty">No entries.</div>}
        </div>
      </div>

      {editing && (
        <MasterEditorModal
          masterKey={active}
          label={master.label}
          fields={master.fields}
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MasterEditorModal({
  masterKey,
  label,
  fields,
  row,
  onClose,
}: {
  masterKey: RefKey;
  label: string;
  fields: FieldDef[];
  row: RefRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [values, setValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    for (const f of fields) {
      if (row && row[f.key] !== undefined) initial[f.key] = row[f.key];
      else initial[f.key] = f.type === 'checkbox' ? false : '';
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setField(key: string, value: any) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    for (const f of fields) {
      if (f.required && (values[f.key] === '' || values[f.key] === undefined || values[f.key] === null)) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    const payload: Record<string, any> = {};
    for (const f of fields) {
      let v = values[f.key];
      if (f.type === 'number' && v !== '' && v !== null && v !== undefined) v = Number(v);
      if (f.type === 'number' && v === '') v = null;
      payload[f.key] = v;
    }
    setBusy(true);
    try {
      if (row) {
        const idField = REF_ID_FIELD[masterKey];
        await updateRefItem(masterKey, row[idField], payload);
        notify(`${label.replace(/s$/, '')} updated.`, 'success');
      } else {
        await createRefItem(masterKey, payload);
        notify(`${label.replace(/s$/, '')} created.`, 'success');
      }
      queryClient.invalidateQueries({ queryKey: ['ref', masterKey] });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Could not save this record.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${row ? 'Edit' : 'Add'} ${label.replace(/s$/, '')}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}{f.required ? ' *' : ''}</label>
              {f.type === 'checkbox' && (
                <input type="checkbox" checked={!!values[f.key]} onChange={(e) => setField(f.key, e.target.checked)} />
              )}
              {f.type === 'select' && (
                <select className="input" value={values[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
                  <option value="" disabled>Select…</option>
                  {(f.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
              {(f.type === 'text' || f.type === 'number' || f.type === 'color') && (
                <input
                  className="input"
                  type={f.type === 'color' ? 'color' : f.type}
                  value={values[f.key] ?? (f.type === 'color' ? '#9a7440' : '')}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
