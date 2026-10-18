// Standard Indian 10-digit mobile number: exactly 10 digits, first digit 6-9.
// Mirrors backend/src/utils/validators.ts MOBILE_REGEX exactly.
export const MOBILE_REGEX = /^[6-9]\d{9}$/;
export const MOBILE_ERROR_MESSAGE = 'Enter a valid 10-digit mobile number starting with 6-9';

// Practical RFC 5322-ish email pattern (not a trivial `.+@.+` check).
// Mirrors backend/src/utils/validators.ts EMAIL_REGEX exactly.
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export const EMAIL_ERROR_MESSAGE = 'Enter a valid email address';

export function isValidMobile(value: string): boolean {
  return MOBILE_REGEX.test(value.trim());
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/** Returns an error message for the mobile field, or null if valid. */
export function validateMobile(value: string): string | null {
  if (!value.trim()) return 'Mobile number is required';
  return isValidMobile(value) ? null : MOBILE_ERROR_MESSAGE;
}

/** Returns an error message for the email field, or null if valid/empty (email is often optional). */
export function validateEmail(value: string, required = false): string | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? 'Email is required' : null;
  return isValidEmail(trimmed) ? null : EMAIL_ERROR_MESSAGE;
}
