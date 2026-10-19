import { api } from './client';
import type { AuthSession, User } from './types';

export function resolveOrg(input: { mobile?: string; orgSlug?: string }) {
  return api.post<{ orgId: string; orgName: string; orgSlug: string }>(
    '/auth/resolve-org',
    input,
    { skipAuth: true }
  );
}

// Login is mobile + OTP for every role (no password).
export function sendLoginOtp(input: { mobile: string }) {
  return api.post<{ sent: boolean }>('/auth/otp/send', input, { skipAuth: true });
}

export function verifyLoginOtp(input: { mobile: string; otp: string }) {
  return api.post<AuthSession>('/auth/otp/verify', input, { skipAuth: true });
}

export function refresh(refreshToken: string) {
  return api.post<AuthSession>('/auth/refresh', { refreshToken }, { skipAuth: true });
}

export function logout() {
  return api.post<void>('/auth/logout');
}

export function stepUp(input: { password: string }) {
  return api.post<{ stepUpToken: string; expiresAt?: string }>('/auth/step-up', input);
}

export function me() {
  return api.get<User>('/auth/me');
}

// Self-service onboarding (public, no auth)
export interface OnboardingStartInput {
  orgName: string;
  industry: string;
  country: string;
  timezone: string;
  subscriptionPlan: string;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
}

export function onboardingStart(input: OnboardingStartInput) {
  return api.post<{ id: string }>('/onboarding/start', input, { skipAuth: true });
}

export function onboardingResendOtp(id: string) {
  return api.post<void>(`/onboarding/${id}/resend-otp`, undefined, { skipAuth: true });
}

export function onboardingVerify(id: string, input: { mobileOtp: string; emailOtp: string }) {
  return api.post<{ orgId: string; orgSlug: string }>(
    `/onboarding/${id}/verify`,
    input,
    { skipAuth: true }
  );
}
