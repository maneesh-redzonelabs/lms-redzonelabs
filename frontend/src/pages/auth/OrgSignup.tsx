import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import { useReferenceData } from '../../hooks/useReferenceData';
import { validateEmail, validateMobile } from '../../utils/validators';

type Step = 'form' | 'otp' | 'done';

// Matches the prototype's ORG_SIGNUP_TIMEZONES exactly - these are stored as-is in the
// organization's `timezone` column, which is only ever displayed back, never parsed as an
// IANA zone identifier.
const TIMEZONES = [
  '(GMT+5:30) India Standard Time',
  '(GMT+4:00) Gulf Standard Time',
  '(GMT+8:00) Singapore Standard Time',
  '(GMT+1:00) Central European Time',
  '(GMT-5:00) Eastern Time (US & Canada)',
];

export default function OrgSignup() {
  const navigate = useNavigate();
  const industries = useReferenceData('industries');

  const [step, setStep] = useState<Step>('form');
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [resultOrgSlug, setResultOrgSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    orgName: '',
    industry: '',
    timezone: TIMEZONES[0],
    contactName: '',
    contactMobile: '',
    contactEmail: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [emailOtp, setEmailOtp] = useState('');

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setLogoFile(null);
      setLogoError(null);
      return;
    }
    if (file.type !== 'image/png') {
      setLogoError('Organization logo must be a .png file.');
      e.target.value = '';
      setLogoFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('Organization logo must be 5 MB or smaller.');
      e.target.value = '';
      setLogoFile(null);
      return;
    }
    setLogoError(null);
    setLogoFile(file);
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
      const result = await authApi.onboardingStart({ ...form, country: 'India' });
      if (logoFile) {
        try {
          await authApi.onboardingUploadLogo(result.id, logoFile);
        } catch {
          // Logo upload failing shouldn't block signup - the organization is created without
          // a logo (falls back to the initials placeholder), same as skipping the field.
        }
      }
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
    <main className="auth-main">
      <div className="auth-card">
        <div className="mobile-brand">
          <div className="brand-logo-frame">
            <svg width="26" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a7440" strokeWidth="2">
              <path d="M3 21h18M5 21V7l7-4 7 4v14" />
            </svg>
          </div>
          <strong>RedZone Labs</strong>
        </div>
        <div className="eyebrow">New organization</div>
        <h2>Set up your Lead Management account</h2>

        {step === 'form' && (
          <form onSubmit={handleStart}>
            <div className="alert alert-info" style={{ marginBottom: 14 }}>This primary contact will be the Admin for the Organization.</div>
            <div className="field">
              <label htmlFor="orgName">Organization Name *</label>
              <input id="orgName" className="input" required value={form.orgName} onChange={(e) => update('orgName', e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="industry">Industry *</label>
                <select id="industry" className="input" required value={form.industry} onChange={(e) => update('industry', e.target.value)}>
                  <option value="">Select…</option>
                  {(industries.data ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="timezone">Time Zone *</label>
                <select id="timezone" className="input" required value={form.timezone} onChange={(e) => update('timezone', e.target.value)}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="orgLogo">Organization Logo</label>
                <input id="orgLogo" className="input" type="file" accept=".png,image/png" onChange={handleLogoChange} />
                <span className="hint">Optional. Accepts .png files only, up to 5 MB.</span>
                {logoError && <span className="error">{logoError}</span>}
              </div>
              <div className="field">
                <label htmlFor="contactName">Primary Contact Name *</label>
                <input id="contactName" className="input" required value={form.contactName} onChange={(e) => update('contactName', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="contactMobile">Mobile No. *</label>
                <input id="contactMobile" className="input" maxLength={10} required value={form.contactMobile} onChange={(e) => update('contactMobile', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="contactEmail">Email id *</label>
                <input id="contactEmail" type="email" className="input" required value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} />
              </div>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerify}>
            <div className="auth-note">
              We've sent a one-time verification code to {form.contactEmail}. Demo code: <b>123456</b>.
            </div>
            <div className="field">
              <label htmlFor="emailOtp">Verification code *</label>
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
              <button type="button" className="btn" onClick={handleResend} disabled={busy}>Resend codes</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify & create organization'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div>
            <div className="alert alert-info">
              Organization and primary contact created successfully{resultOrgSlug ? ` (${resultOrgSlug})` : ''}. You can
              now sign in with your registered mobile number.
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => navigate('/login')}>Go to sign in</button>
            </div>
          </div>
        )}

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
