import { api } from './client';
import type { AuthSession, User } from './types';

// Every backend route wraps its payload as `{ data: ... }` (see backend's AppError/success
// envelope convention). apiRequest() in client.ts intentionally does NOT unwrap this generically,
// because paginated list endpoints return `{ data: T[], meta }` and callers rely on both fields
// as-is (see Paginated<T> in client.ts). Single-object endpoints like these auth ones need their
// own unwrap, done here.
interface Envelope<T> {
  data: T;
}

export async function resolveOrg(input: { mobile?: string; orgSlug?: string }) {
  const res = await api.post<Envelope<{ orgId: string; orgName: string; orgSlug: string }>>(
    '/auth/resolve-org',
    input,
    { skipAuth: true }
  );
  return res.data;
}

// Login is mobile + OTP for every role (no password).
export async function sendLoginOtp(input: { mobile: string }) {
  const res = await api.post<Envelope<{ sent: boolean }>>('/auth/otp/send', input, { skipAuth: true });
  return res.data;
}

export async function verifyLoginOtp(input: { mobile: string; otp: string }) {
  const res = await api.post<Envelope<AuthSession>>('/auth/otp/verify', input, { skipAuth: true });
  return res.data;
}

export async function refresh(refreshToken: string) {
  const res = await api.post<Envelope<AuthSession>>('/auth/refresh', { refreshToken }, { skipAuth: true });
  return res.data;
}

export async function logout() {
  await api.post<Envelope<{ loggedOut: boolean }>>('/auth/logout');
}

export async function stepUp(input: { password: string }) {
  const res = await api.post<Envelope<{ stepUpToken: string; expiresIn: number }>>('/auth/step-up', input);
  return res.data;
}

export async function me() {
  const res = await api.get<Envelope<User>>('/auth/me');
  return res.data;
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

export async function onboardingStart(input: OnboardingStartInput) {
  // Backend's startSchema (.strict()) expects { mobile, email }, not { contactMobile, contactEmail }
  // - map field names here rather than renaming the form fields throughout OrgSignup.tsx.
  const res = await api.post<Envelope<{ verificationId: string; expiresAt: string }>>(
    '/onboarding/start',
    {
      orgName: input.orgName,
      industry: input.industry,
      country: input.country,
      timezone: input.timezone,
      subscriptionPlan: input.subscriptionPlan,
      contactName: input.contactName,
      mobile: input.contactMobile,
      email: input.contactEmail
    },
    { skipAuth: true }
  );
  return { id: res.data.verificationId, expiresAt: res.data.expiresAt };
}

export async function onboardingResendOtp(id: string) {
  await api.post<Envelope<{ expiresAt: string }>>(`/onboarding/${id}/resend-otp`, undefined, { skipAuth: true });
}

export async function onboardingVerify(id: string, input: { emailOtp: string }) {
  const res = await api.post<Envelope<{ orgId: string; orgSlug: string }>>(
    `/onboarding/${id}/verify`,
    input,
    { skipAuth: true }
  );
  return res.data;
}
