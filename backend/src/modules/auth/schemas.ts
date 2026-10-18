import { z } from 'zod';
import { mobileSchema } from '../../utils/validators';

export const resolveOrgSchema = z.object({ slugOrDomain: z.string().min(1).max(100) }).strict();

export const loginSchema = z
  .object({
    orgId: z.number().int().positive().optional(),
    mobile: mobileSchema,
    password: z.string().min(1)
  })
  .strict();

export const refreshSchema = z.object({ refreshToken: z.string().min(10) }).strict();

export const logoutSchema = z.object({ everywhere: z.boolean().optional() }).strict();

export const stepUpSchema = z.object({ password: z.string().min(1) }).strict();
