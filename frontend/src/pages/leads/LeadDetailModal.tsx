import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as leadsApi from '../../api/leads';
import { Modal } from '../../components/Modal';
import { StepUpModal } from '../../components/StepUpModal';
import { useReferenceData } from '../../hooks/useReferenceData';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../api/client';

type Tab = 'details' | 'activities' | 'history';

export function LeadDetailModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const statuses = useReferenceData('leadStatuses');
  const [tab, setTab] = useState<Tab>('details');

  const leadQuery = useQuery({ queryKey: ['lead', leadId], queryFn: () => leadsApi.getLead(leadId) });
  const activitiesQuery = useQuery({ queryKey: ['lead-activities', leadId], queryFn: () => leadsApi.getLeadActivities(leadId), enabled: tab === 'activities' });
  const historyQuery = useQuery({ queryKey: ['lead-history', leadId], queryFn: () => leadsApi.getLeadHistory(leadId), enabled: tab === 'history' });

  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lead = leadQuery.data;

  const patchMutation = useMutation({
    mutationFn: ({ status, stepUpToken }: { status?: string; stepUpToken?: string }) =>
      leadsApi.patchLead(leadId, { status, remarks: remarks || undefined }, stepUpToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      notify('Lead updated.', 'success');
      setPendingStatus(null);
      setNeedsStepUp(false);
      setRemarks('');
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'STEP_UP_REQUIRED') { setNeedsStepUp(true); return; }
        if (err.code === 'TERMINAL_STATUS_TRANSITION') setError('This status transition is not allowed from a terminal state.');
        else setError(err.message);
      } else setError('Could not update lead.');
    },
  });

  function isSensitiveTransition(newStatus: string) {
    return lead?.status === 'Won' || newStatus === 'Won';
  }

  function handleStatusSubmit(newStatus: string) {
    setError(null);
    if (isSensitiveTransition(newStatus) && !remarks.trim()) {
      setError('Remarks are mandatory when editing a Won lead or changing its status.');
      return;
    }
    setPendingStatus(newStatus);
    if (isSensitiveTransition(newStatus)) {
      setNeedsStepUp(true);
    } else {
      patchMutation.mutate({ status: newStatus });
    }
  }

  function handleStepUpVerified(stepUpToken: string) {
    if (!pendingStatus) return;
    patchMutation.mutate({ status: pendingStatus, stepUpToken });
  }

  if (leadQuery.isLoading) {
    return <Modal title="Lead" onClose={onClose}><div className="table-empty">Loading…</div></Modal>;
  }
  if (leadQuery.isError || !lead) {
    return <Modal title="Lead" onClose={onClose}><div className="alert alert-error">Could not load lead.</div></Modal>;
  }

  return (
    <Modal title={lead.name} onClose={onClose} wide>
      <div className="filters-bar">
        <button className={`btn btn-sm${tab === 'details' ? ' btn-primary' : ''}`} onClick={() => setTab('details')}>Details</button>
        <button className={`btn btn-sm${tab === 'activities' ? ' btn-primary' : ''}`} onClick={() => setTab('activities')}>Activities</button>
        <button className={`btn btn-sm${tab === 'history' ? ' btn-primary' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'details' && (
        <div>
          <div className="form-grid">
            <div className="field"><label>Mobile</label><div>{lead.mobile}</div></div>
            <div className="field"><label>Email</label><div>{lead.email || '-'}</div></div>
            <div className="field"><label>Project</label><div>{lead.projectName || '-'}</div></div>
            <div className="field"><label>Owner</label><div>{lead.ownerName || '-'}</div></div>
            <div className="field"><label>Budget</label><div>{lead.budgetRange || '-'}</div></div>
            <div className="field"><label>Timeline</label><div>{lead.timeline || '-'}</div></div>
          </div>

          <div className="field">
            <label>Status</label>
            <select
              className="input"
              value={lead.status}
              onChange={(e) => handleStatusSubmit(e.target.value)}
              disabled={patchMutation.isPending}
            >
              {(statuses.data ?? []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </div>

          {(lead.status === 'Won') && (
            <div className="alert alert-warn">Editing a Won lead requires remarks and a password re-confirmation.</div>
          )}

          <div className="field">
            <label>Remarks {isSensitiveTransition(lead.status) && <em>(required for Won-status changes)</em>}</label>
            <textarea className="input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>

          {error && <div className="alert alert-error">{error}</div>}
        </div>
      )}

      {tab === 'activities' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Type</th><th>Note</th><th>When</th></tr></thead>
            <tbody>
              {(activitiesQuery.data ?? []).map((a) => (
                <tr key={a.id}><td>{a.type}</td><td>{a.note || '-'}</td><td>{new Date(a.createdAt).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
          {activitiesQuery.data && !activitiesQuery.data.length && <div className="table-empty">No activities yet.</div>}
        </div>
      )}

      {tab === 'history' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Field</th><th>Old</th><th>New</th><th>When</th><th>By</th></tr></thead>
            <tbody>
              {(historyQuery.data ?? []).map((h) => (
                <tr key={h.id}>
                  <td>{h.field}</td><td>{h.oldValue || '-'}</td><td>{h.newValue || '-'}</td>
                  <td>{new Date(h.changedAt).toLocaleString()}</td><td>{h.changedBy || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {historyQuery.data && !historyQuery.data.length && <div className="table-empty">No history yet.</div>}
        </div>
      )}

      {needsStepUp && pendingStatus && (
        <StepUpModal
          reason="Changing a Won lead's status requires re-confirming your password before the change is saved."
          onCancel={() => { setNeedsStepUp(false); setPendingStatus(null); }}
          onVerified={handleStepUpVerified}
        />
      )}
    </Modal>
  );
}
