import { z } from 'zod';
import { mobileSchema } from '../../utils/validators';

export const resolveOrgSchema = z
  .object({
    slugOrDomain: z.string().min(1).max(100).optional(),
    mobile: mobileSchema.optional()
  })
  .strict()
  .refine((v) => !!v.slugOrDomain || !!v.mobile, {
    message: 'Provide either slugOrDomain or mobile'
  });

export const refreshSchema = z.object({ refreshToken: z.string().min(10) }).strict();

export const logoutSchema = z.object({ everywhere: z.boolean().optional() }).strict();

export const stepUpSchema = z.object({ password: z.string().min(1) }).strict();

export const sendLoginOtpSchema = z.object({ mobile: mobileSchema }).strict();

export const verifyLoginOtpSchema = z
  .object({ mobile: mobileSchema, otp: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code') })
  .strict();
