import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import { validateMobile } from '../../utils/validators';

// Matches the static prototype's demo OTP exactly - it is a fixed mock code shown on screen,
// not a randomly generated/delivered one.
const DEMO_OTP = '123456';

export default function Login() {
  const { loginWithOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };

  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleMobileChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Restrict to digits only, max 10 - matches the prototype's maxlength="10" numeric input.
    setMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const mobileError = validateMobile(mobile);
    if (mobileError) {
      setError(mobileError);
      return;
    }
    setBusy(true);
    try {
      await authApi.sendLoginOtp({ mobile: mobile.trim() });
      setStep('otp');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Could not send a verification code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await loginWithOtp({ mobile: mobile.trim(), otp: otp.trim() });
      const target = user.role === 'platformadmin' ? '/platform' : (location.state?.from?.pathname || '/dashboard');
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'TOO_MANY_ATTEMPTS') setError('Too many incorrect attempts. Please try again later.');
        else setError(err.message || 'Incorrect code. Use the demo code shown above.');
      } else {
        setError('Verification failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  function handleChangeMobile() {
    setStep('mobile');
    setOtp('');
    setError(null);
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
          {step === 'mobile'
            ? "Enter your registered mobile number. We'll send a one-time verification code."
            : `Enter the one-time code sent to +91 ${mobile}.`}
        </p>

        {step === 'mobile' && (
          <form onSubmit={handleSendOtp}>
            <div className="field">
              <label htmlFor="mobile">Registered mobile number</label>
              <input
                id="mobile"
                className="input"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={handleMobileChange}
                placeholder="10-digit registered mobile"
                required
                autoFocus
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy || mobile.length !== 10}>
                {busy ? 'Sending…' : 'Send one-time code'}
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
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                required
                autoFocus
              />
            </div>
            <div className="alert alert-info">
              Demo verification code: <strong>{DEMO_OTP}</strong>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-actions">
              <button type="button" className="btn" onClick={handleChangeMobile} disabled={busy}>
                Change mobile number
              </button>
              <button type="button" className="btn" onClick={handleResendOtp} disabled={busy}>
                Resend code
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || otp.length !== 6}>
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
