import React, { useState } from 'react';
import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import { useReferenceData } from '../../hooks/useReferenceData';
import { validateEmail, validateMobile } from '../../utils/validators';
import { Modal } from '../../components/Modal';

type Step = 'form' | 'otp' | 'done';

// Lets a signed-in Platform Admin onboard a new organization without leaving the Platform
// console - the public /signup page (OrgSignup.tsx) is a separate, unauthenticated flow for
// prospects signing themselves up and is intentionally left untouched.
export function OnboardOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const industries = useReferenceData('industries');
  const plans = useReferenceData('subscriptionPlans');

  const [step, setStep] = useState<Step>('form');
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [resultOrgSlug, setResultOrgSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    orgName: '',
    industry: '',
    country: 'India',
    timezone: 'Asia/Kolkata',
    subscriptionPlan: '',
    contactName: '',
    contactMobile: '',
    contactEmail: '',
  });

  const [emailOtp, setEmailOtp] = useState('');

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const mobileError = validateMobile(form.contactMobile);
    if (mobileError) {
      setError(mobileError);
      return;
    }
    const emailError = validateEmail(form.contactEmail, true);
    if (emailError) {
      setError(emailError);
      return;
    }
    setBusy(true);
    try {
      const result = await authApi.onboardingStart(form);
      setOnboardingId(result.id);
      setStep('otp');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_MOBILE') setError('An organization is already registered with this mobile number.');
        else setError(err.message);
      } else setError('Could not start onboarding. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!onboardingId) return;
    setError(null);
    try {
      await authApi.onboardingResendOtp(onboardingId);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!onboardingId) return;
    setError(null);
    setBusy(true);
    try {
      const result = await authApi.onboardingVerify(onboardingId, { emailOtp });
      setResultOrgSlug(result.orgSlug);
      setStep('done');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'TOO_MANY_ATTEMPTS') setError('Too many incorrect attempts. Request a new code and try again.');
        else setError(err.message);
      } else setError('Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Onboard new organization" onClose={onClose}>
      {step === 'form' && (
        <form onSubmit={handleStart}>
          <div className="field">
            <label htmlFor="orgName">Organization name</label>
            <input id="orgName" className="input" required value={form.orgName} onChange={(e) => update('orgName', e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="industry">Industry</label>
              <select id="industry" className="input" required value={form.industry} onChange={(e) => update('industry', e.target.value)}>
                <option value="">Select…</option>
                {(industries.data ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="plan">Subscription plan</label>
              <select id="plan" className="input" required value={form.subscriptionPlan} onChange={(e) => update('subscriptionPlan', e.target.value)}>
                <option value="">Select…</option>
                {(plans.data ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="country">Country</label>
              <input id="country" className="input" required value={form.country} onChange={(e) => update('country', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="timezone">Timezone</label>
              <input id="timezone" className="input" required value={form.timezone} onChange={(e) => update('timezone', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="contactName">Primary contact name</label>
              <input id="contactName" className="input" required value={form.contactName} onChange={(e) => update('contactName', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="contactMobile">Primary contact mobile</label>
              <input id="contactMobile" className="input" required value={form.contactMobile} onChange={(e) => update('contactMobile', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="contactEmail">Primary contact email</label>
              <input id="contactEmail" type="email" className="input" required value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Starting…' : 'Continue'}
            </button>
          </div>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerify}>
          <div className="auth-note">
            Demo verification code: <b>123456</b>. We'll integrate real email delivery later.
          </div>
          <div className="field">
            <label htmlFor="emailOtp">Email verification code</label>
            <input
              id="emailOtp"
              className="input"
              inputMode="numeric"
              maxLength={6}
              required
              value={emailOtp}
              onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setStep('form')} disabled={busy}>Back</button>
            <button type="button" className="btn" onClick={handleResend} disabled={busy}>Resend code</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & create'}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div>
          <div className="alert alert-info">
            Organization{resultOrgSlug ? ` "${resultOrgSlug}"` : ''} has been created and now appears in the directory.
            Its admin can sign in with their registered mobile number.
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
