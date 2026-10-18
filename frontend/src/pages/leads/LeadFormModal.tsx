import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as leadsApi from '../../api/leads';
import * as projectsApi from '../../api/projects';
import { Modal } from '../../components/Modal';
import { useReferenceData } from '../../hooks/useReferenceData';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../api/client';

export function LeadFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const budgetRanges = useReferenceData('budgetRanges');
  const timelines = useReferenceData('timelines');
  const projectsQuery = useQuery({ queryKey: ['projects-lite'], queryFn: () => projectsApi.listProjects({ pageSize: 100 }) });

  const [form, setForm] = useState({
    name: '', mobile: '', email: '', projectId: '', budgetRange: '', timeline: '', source: '', remarks: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => leadsApi.createLead({ ...form, projectId: form.projectId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      notify('Lead created.', 'success');
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_MOBILE') setError('A lead with this mobile number already exists.');
        else setError(err.message);
      } else setError('Could not create lead.');
    },
  });

  return (
    <Modal title="Add lead" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input className="input" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label>Project</label>
            <select className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Unassigned</option>
              {(projectsQuery.data?.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Budget range</label>
            <select className="input" value={form.budgetRange} onChange={(e) => setForm({ ...form, budgetRange: e.target.value })}>
              <option value="">Select…</option>
              {(budgetRanges.data ?? []).map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Timeline</label>
            <select className="input" value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })}>
              <option value="">Select…</option>
              {(timelines.data ?? []).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Source</label>
            <input className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Remarks</label>
          <textarea className="input" rows={3} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
