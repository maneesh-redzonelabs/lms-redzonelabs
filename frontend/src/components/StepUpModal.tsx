import React, { useState } from 'react';
import { Modal } from './Modal';
import { stepUp } from '../api/auth';
import { ApiError } from '../api/client';

export function StepUpModal({
  reason,
  onCancel,
  onVerified,
}: {
  reason: string;
  onCancel: () => void;
  onVerified: (stepUpToken: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await stepUp({ password });
      onVerified(result.stepUpToken);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'TOO_MANY_ATTEMPTS') setError('Too many attempts. Please wait before trying again.');
        else setError(err.message || 'Re-authentication failed.');
      } else {
        setError('Re-authentication failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Confirm your identity" onClose={onCancel}>
      <div className="step-up-box">{reason}</div>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="stepup-password">Password</label>
          <input
            id="stepup-password"
            className="input"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !password}>
            {busy ? 'Verifying…' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
