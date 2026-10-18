import { z } from 'zod';

export const allocateSchema = z.object({ leadId: z.number().int().positive() }).strict();

export const underwriteSchema = z
  .object({
    durationMonths: z.number().int().positive().max(60),
    remarks: z.string().max(2000).optional()
  })
  .strict();
