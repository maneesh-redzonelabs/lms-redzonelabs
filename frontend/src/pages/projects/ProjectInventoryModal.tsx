import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as projectsApi from '../../api/projects';
import type { Project, Unit } from '../../api/types';
import { Modal } from '../../components/Modal';
import { StepUpModal } from '../../components/StepUpModal';
import { useToast } from '../../components/Toast';
import { usePermissions } from '../../auth/usePermissions';
import { ApiError } from '../../api/client';

export function ProjectInventoryModal({
  project,
  readOnly,
  onClose,
}: {
  project: Project;
  readOnly: boolean;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [allocatingUnit, setAllocatingUnit] = useState<Unit | null>(null);
  const [reallocatingUnit, setReallocatingUnit] = useState<Unit | null>(null);
  const [pendingLeadId, setPendingLeadId] = useState('');
  const [realloStep, setRealloStep] = useState<'pick-lead' | 'step-up'>('pick-lead');

  const unitsQuery = useQuery({
    queryKey: ['units', project.id, statusFilter],
    queryFn: () => projectsApi.listUnits(project.id, { status: statusFilter || undefined, pageSize: 200 }),
  });

  const allocateMutation = useMutation({
    mutationFn: (leadId: string) => projectsApi.allocateUnit(allocatingUnit!.id, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', project.id] });
      notify('Unit allocated.', 'success');
      setAllocatingUnit(null);
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Could not allocate unit.', 'error'),
  });

  const underwriteMutation = useMutation({
    mutationFn: (unitId: string) => projectsApi.underwriteUnit(unitId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['units', project.id] }); notify('Unit underwritten.', 'success'); },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Could not underwrite unit.', 'error'),
  });

  const releaseMutation = useMutation({
    mutationFn: (unitId: string) => projectsApi.releaseHold(unitId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['units', project.id] }); notify('Hold released.', 'success'); },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Could not release hold.', 'error'),
  });

  async function completeReallocate(stepUpToken: string) {
    if (!reallocatingUnit) return;
    try {
      await projectsApi.reallocateUnit(reallocatingUnit.id, pendingLeadId, stepUpToken);
      queryClient.invalidateQueries({ queryKey: ['units', project.id] });
      notify('Unit reallocated.', 'success');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not reallocate unit.', 'error');
    } finally {
      setReallocatingUnit(null);
      setPendingLeadId('');
      setRealloStep('pick-lead');
    }
  }

  return (
    <Modal title={`${project.name} — Inventory`} onClose={onClose} wide>
      <div className="filters-bar">
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="held">Held</option>
          <option value="allocated">Allocated</option>
          <option value="sold">Sold</option>
        </select>
      </div>

      {unitsQuery.isLoading && <div className="table-empty">Loading units…</div>}
      {unitsQuery.isError && <div className="alert alert-error">Could not load units.</div>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Unit</th><th>Tower</th><th>Floor</th><th>Status</th><th>Price</th>{!readOnly && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {(unitsQuery.data?.data ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.code}</td>
                <td>{u.tower || '-'}</td>
                <td>{u.floor ?? '-'}</td>
                <td><span className="badge badge-neutral">{u.status}</span></td>
                <td>{u.price ? u.price.toLocaleString() : '-'}</td>
                {!readOnly && (
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {u.status === 'available' && (
                      <button className="btn btn-sm" disabled={!perms.canAllocateUnits} onClick={() => setAllocatingUnit(u)}>Allocate</button>
                    )}
                    {u.status === 'allocated' && (
                      <button className="btn btn-sm" disabled={!perms.canAllocateUnits} onClick={() => { setReallocatingUnit(u); setRealloStep('pick-lead'); setPendingLeadId(''); }}>Reallocate</button>
                    )}
                    {u.status === 'held' && (
                      <>
                        <button className="btn btn-sm" onClick={() => underwriteMutation.mutate(u.id)}>Underwrite</button>
                        <button className="btn btn-sm" onClick={() => releaseMutation.mutate(u.id)}>Release hold</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {unitsQuery.data && !unitsQuery.data.data.length && <div className="table-empty">No units found.</div>}
      </div>

      {allocatingUnit && (
        <Modal title={`Allocate unit ${allocatingUnit.code}`} onClose={() => setAllocatingUnit(null)}>
          <form onSubmit={(e) => { e.preventDefault(); allocateMutation.mutate(pendingLeadId); }}>
            <div className="field">
              <label>Lead ID</label>
              <input className="input" required value={pendingLeadId} onChange={(e) => setPendingLeadId(e.target.value)} placeholder="Enter won lead ID" />
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setAllocatingUnit(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={allocateMutation.isPending}>Allocate</button>
            </div>
          </form>
        </Modal>
      )}

      {reallocatingUnit && realloStep === 'pick-lead' && (
        <Modal title={`Reallocate unit ${reallocatingUnit.code}`} onClose={() => setReallocatingUnit(null)}>
          <form onSubmit={(e) => { e.preventDefault(); setRealloStep('step-up'); }}>
            <div className="field">
              <label>New lead ID</label>
              <input className="input" required value={pendingLeadId} onChange={(e) => setPendingLeadId(e.target.value)} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setReallocatingUnit(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!pendingLeadId}>
                Continue
              </button>
            </div>
          </form>
        </Modal>
      )}

      {reallocatingUnit && realloStep === 'step-up' && (
        <StepUpModal
          reason="Reallocating a unit requires re-confirming your password."
          onCancel={() => { setReallocatingUnit(null); setPendingLeadId(''); setRealloStep('pick-lead'); }}
          onVerified={completeReallocate}
        />
      )}
    </Modal>
  );
}
