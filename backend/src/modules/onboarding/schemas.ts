import { z } from 'zod';
import { emailSchema, mobileSchema } from '../../utils/validators';

// Self-service signup always starts an organization on the 'trial' plan (matches the prototype,
// which never offers a plan choice at signup) - subscriptionPlan is therefore not client input;
// upgrading plans is a separate, later action (platform admin / billing), not part of signup.
export const startSchema = z
  .object({
    orgName: z.string().min(2).max(150),
    industry: z.string().min(2).max(60),
    country: z.string().min(2).max(60),
    timezone: z.string().min(2).max(60),
    contactName: z.string().min(2).max(100),
    mobile: mobileSchema,
    email: emailSchema
  })
  .strict();

// No fields needed - resend always re-sends the email verification code for this signup.
export const resendOtpSchema = z.object({}).strict().optional();

// Organization creation is confirmed by the email OTP alone (demo/mock code - see
// backend/src/services/otp.ts). There is no password at signup any more; sign-in is mobile + OTP
// for every role.
export const verifySchema = z
  .object({
    emailOtp: z.string().regex(/^\d{6}$/)
  })
  .strict();

export const paymentStubSchema = z
  .object({
    paymentMethod: z.enum(['upi', 'card', 'netbanking']).optional(),
    licensedUsers: z.number().int().positive().optional()
  })
  .strict();
