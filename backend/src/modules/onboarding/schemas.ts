import { z } from 'zod';

export const startSchema = z
  .object({
    orgName: z.string().min(2).max(150),
    industry: z.string().min(2).max(60),
    country: z.string().min(2).max(60),
    timezone: z.string().min(2).max(60),
    subscriptionPlan: z.enum(['trial', 'starter', 'professional', 'enterprise']),
    contactName: z.string().min(2).max(100),
    mobile: z.string().regex(/^\d{10}$/),
    email: z.string().email()
  })
  .strict();

export const resendOtpSchema = z.object({ channel: z.enum(['mobile', 'email']) }).strict();

export const verifySchema = z
  .object({
    mobileOtp: z.string().regex(/^\d{6}$/),
    emailOtp: z.string().regex(/^\d{6}$/),
    password: z.string().min(8).max(100)
  })
  .strict();

export const paymentStubSchema = z
  .object({
    paymentMethod: z.enum(['upi', 'card', 'netbanking']).optional(),
    licensedUsers: z.number().int().positive().optional()
  })
  .strict();
