import { z } from 'zod';

// Standard Indian 10-digit mobile number: exactly 10 digits, first digit 6-9.
export const MOBILE_REGEX = /^[6-9]\d{9}$/;
export const MOBILE_ERROR_MESSAGE = 'Mobile number must be a valid 10-digit Indian mobile number';

// Practical RFC 5322-ish email pattern (not a trivial `.+@.+` check).
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export const EMAIL_ERROR_MESSAGE = 'Invalid email address';

// Required mobile field, used by auth/onboarding/users/leads schemas.
export const mobileSchema = z.string().regex(MOBILE_REGEX, MOBILE_ERROR_MESSAGE);

// Required email field (max length matches typical column sizing).
export const emailSchema = z.string().max(100).regex(EMAIL_REGEX, EMAIL_ERROR_MESSAGE);

// Optional email that also accepts an empty string (used where the frontend sends '' for "no email").
export const optionalEmailSchema = z
  .string()
  .max(100)
  .regex(EMAIL_REGEX, EMAIL_ERROR_MESSAGE)
  .optional()
  .or(z.literal(''));

// Nullable-optional email (used on partial/update schemas where null clears the field).
export const nullableEmailSchema = z
  .string()
  .max(100)
  .regex(EMAIL_REGEX, EMAIL_ERROR_MESSAGE)
  .nullable()
  .optional();
