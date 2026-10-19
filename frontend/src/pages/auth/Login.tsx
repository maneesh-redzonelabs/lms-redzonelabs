import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import { validateMobile } from '../../utils/validators';

const PLATFORM_ADMIN_MOBILE = '9811295123';

export default function Login() {
  const { login, loginWithOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };

  const [step, setStep] = useState<'org' | 'password' | 'otp'>('org');
  const [orgSlugOrMobile, setOrgSlugOrMobile] = useState('');
  const [orgId, setOrgId] = useState<string | undefined>(undefined);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleResolveOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const mobileError = validateMobile(mobile);
    if (mobileError) {
      setError(mobileError);
      return;
    }
    setBusy(true);
    try {
      if (mobile.trim() === PLATFORM_ADMIN_MOBILE) {
        await authApi.sendLoginOtp({ mobile: mobile.trim() });
        setStep('otp');
        return;
      }
      const result = await authApi.resolveOrg({ mobile: mobile.trim() });
      setOrgId(result.orgId);
      setOrgName(result.orgName);
      setStep('password');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Could not resolve your organization. Check your mobile number.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login({ orgId, mobile: mobile.trim(), password });
      const target = user.role === 'platformadmin' ? '/platform' : (location.state?.from?.pathname || '/dashboard');
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'TOO_MANY_ATTEMPTS') setError('Too many failed attempts. Please try again later.');
        else setError(err.message || 'Login failed.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await loginWithOtp({ mobile: mobile.trim(), otp: otp.trim() });
      navigate('/platform', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'TOO_MANY_ATTEMPTS') setError('Too many incorrect attempts. Request a new code.');
        else setError(err.message || 'Incorrect code.');
      } else {
        setError('Verification failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResendOtp() {
    setError(null);
    setBusy(true);
    try {
      await authApi.sendLoginOtp({ mobile: mobile.trim() });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Could not send a new code. Please try again.');
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
        <div className="eyebrow">Secure access</div>
        <h2>Sign in to your organization</h2>
        <p className="auth-lead">
          {step === 'org'
            ? 'Enter your registered mobile number to continue.'
            : step === 'otp'
            ? `Platform Admin access detected. Enter the one-time code sent to +91 ${mobile.trim()}.`
            : `Signing in to ${orgName ?? 'your organization'}. Enter your password.`}
        </p>

        {step === 'org' && (
          <form onSubmit={handleResolveOrg}>
            <div className="field">
              <label htmlFor="mobile">Registered mobile number</label>
              <input
                id="mobile"
                className="input"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="98xxxxxxx"
                required
                autoFocus
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => { setStep('org'); setError(null); }} disabled={busy}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !password}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <div className="field">
              <label htmlFor="otp">Verification code</label>
              <input
                id="otp"
                className="input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code"
                required
                autoFocus
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => { setStep('org'); setOtp(''); setError(null); }} disabled={busy}>
                Back
              </button>
              <button type="button" className="btn" onClick={handleResendOtp} disabled={busy}>
                Resend code
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || otp.trim().length !== 6}>
                {busy ? 'Verifying…' : 'Verify and continue'}
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer">
          New organization?{' '}
          <Link to="/signup">Set up your account</Link>
        </div>
      </div>
    </main>
  );
}
