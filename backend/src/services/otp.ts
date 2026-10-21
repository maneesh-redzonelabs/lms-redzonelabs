// Centralized OTP delivery for the whole app (login and organization onboarding both use this).
// For now every OTP is a fixed demo/mock code, shown directly in the relevant UI, so there is
// nothing to actually deliver - this module exists so a real SMS gateway (e.g. Twilio/MSG91) and
// email provider (e.g. SendGrid/SES) can be wired in here later without touching every call site.
export const MOCK_OTP = '123456';

export type OtpChannel = 'sms' | 'email';

export function sendOtp(channel: OtpChannel, destination: string, purpose: string): void {
  // eslint-disable-next-line no-console
  console.log(`[MOCK OTP] ${channel === 'sms' ? 'SMS' : 'Email'} OTP for ${purpose} -> ${destination}: ${MOCK_OTP}`);
}

export function verifyOtp(code: string): boolean {
  return code === MOCK_OTP;
}
