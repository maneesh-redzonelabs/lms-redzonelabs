import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as projectsApi from '../../api/projects';
import type { Project } from '../../api/types';
import { Modal } from '../../components/Modal';
import { useReferenceData } from '../../hooks/useReferenceData';
import { useToast } from '../../components/Toast';
import { usePermissions } from '../../auth/usePermissions';
import { ApiError } from '../../api/client';
import { ProjectInventoryModal } from './ProjectInventoryModal';

export default function Projects() {
  const perms = usePermissions();
  const [showCreate, setShowCreate] = useState(false);
  const [inventoryProject, setInventoryProject] = useState<Project | null>(null);

  const query = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.listProjects({ pageSize: 100 }) });

  return (
    <div>
      <div className="card-header">
        <h2>Projects & inventory</h2>
        {perms.canManageProjects && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>New project</button>
        )}
      </div>

      {query.isError && <div className="alert alert-error">Could not load projects.</div>}
      {query.isLoading && <div className="table-empty">Loading projects…</div>}

      <div className="project-grid">
        {(query.data?.data ?? []).map((p) => (
          <div className="project-card" key={p.id}>
            <h3>{p.name}</h3>
            <p>{p.location || p.type} · {p.status}</p>
            <div className="project-stats">
              <span>Total: {p.totalUnits ?? '-'}</span>
              <span>Available: {p.availableUnits ?? '-'}</span>
              <span>Held: {p.heldUnits ?? '-'}</span>
              <span>Sold: {p.soldUnits ?? '-'}</span>
            </div>
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button className="btn btn-sm" onClick={() => setInventoryProject(p)}>
                {perms.canManageProjects ? 'Manage inventory' : 'View inventory'}
              </button>
            </div>
          </div>
        ))}
        {query.data && !query.data.data.length && <div className="empty-state">No projects yet.</div>}
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      {inventoryProject && (
        <ProjectInventoryModal
          project={inventoryProject}
          readOnly={!perms.canManageProjects}
          onClose={() => setInventoryProject(null)}
        />
      )}
    </div>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const types = useReferenceData('projectTypes');
  const statuses = useReferenceData('projectStatuses');

  const [form, setForm] = useState({ name: '', type: '', status: '', location: '' });
  const [addInventory, setAddInventory] = useState(false);
  const [invMode, setInvMode] = useState<'apartment' | 'plot'>('apartment');
  const [tower, setTower] = useState('');
  const [floors, setFloors] = useState(1);
  const [unitsPerFloor, setUnitsPerFloor] = useState(1);
  const [plotPrefix, setPlotPrefix] = useState('');
  const [plotCount, setPlotCount] = useState(1);
  const [plotStartNumber, setPlotStartNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      projectsApi.createProject({
        ...form,
        initialInventory: addInventory
          ? invMode === 'apartment'
            ? { mode: 'apartment', tower, floors, unitsPerFloor }
            : { mode: 'plot', plotPrefix, plotCount, plotStartNumber }
          : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      notify('Project created.', 'success');
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) setError(err.message);
      else setError('Could not create project.');
    },
  });

  return (
    <Modal title="New project" onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <div className="form-grid">
          <div className="field">
            <label>Project name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Type</label>
            <select className="input" required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="">Select…</option>
              {(types.data ?? []).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select className="input" required value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="">Select…</option>
              {(statuses.data ?? []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Location</label>
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label>
            <input type="checkbox" checked={addInventory} onChange={(e) => setAddInventory(e.target.checked)} /> Add initial inventory batch
          </label>
        </div>

        {addInventory && (
          <div className="card">
            <div className="field">
              <label>Inventory mode</label>
              <select className="input" value={invMode} onChange={(e) => setInvMode(e.target.value as 'apartment' | 'plot')}>
                <option value="apartment">Apartment tower / floors</option>
                <option value="plot">Plot batch</option>
              </select>
            </div>
            {invMode === 'apartment' ? (
              <div className="form-grid">
                <div className="field"><label>Tower</label><input className="input" value={tower} onChange={(e) => setTower(e.target.value)} /></div>
                <div className="field"><label>Floors</label><input className="input" type="number" min={1} value={floors} onChange={(e) => setFloors(Number(e.target.value))} /></div>
                <div className="field"><label>Units per floor</label><input className="input" type="number" min={1} value={unitsPerFloor} onChange={(e) => setUnitsPerFloor(Number(e.target.value))} /></div>
              </div>
            ) : (
              <div className="form-grid">
                <div className="field"><label>Plot prefix</label><input className="input" value={plotPrefix} onChange={(e) => setPlotPrefix(e.target.value)} /></div>
                <div className="field"><label>Plot count</label><input className="input" type="number" min={1} value={plotCount} onChange={(e) => setPlotCount(Number(e.target.value))} /></div>
                <div className="field"><label>Start number</label><input className="input" type="number" min={1} value={plotStartNumber} onChange={(e) => setPlotStartNumber(Number(e.target.value))} /></div>
              </div>
            )}
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
