import { z } from 'zod';

// frontend/src/pages/platform/OrganizationsDirectory.tsx (EditOrgModal) only ever sends
// { status: 'active'|'suspended'|'pending', usersMax: number } via patchTenant(), not the raw
// subscriptionStatus/maxUsers column names.
export const updateTenantSchema = z
  .object({
    status: z.enum(['active', 'suspended', 'pending']).optional(),
    usersMax: z.coerce.number().int().positive().optional(),
    subscriptionPlan: z.enum(['trial', 'starter', 'professional', 'enterprise']).optional(),
    subscriptionStatus: z.enum(['trialing', 'active', 'past_due', 'suspended', 'cancelled']).optional(),
    trialEndsAt: z.string().nullable().optional(),
    subscriptionEndsAt: z.string().nullable().optional(),
    maxUsers: z.number().int().positive().optional(),
    maxProjects: z.number().int().positive().optional(),
    isActive: z.boolean().optional()
  })
  .strict();
