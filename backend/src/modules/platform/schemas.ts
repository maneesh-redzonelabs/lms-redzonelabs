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
    isActive: z.boolean().optional(),
    // account_admin_lms_desktop_v_1.4.1.html's platformVerifyOrganization: Pending (just
    // onboarded, cannot sign in yet) / Active (verified, can sign in) / Suspended (blocked,
    // "contact your Admin") - independent of the billing subscriptionStatus above.
    orgStatus: z.enum(['Pending', 'Active', 'Suspended']).optional(),
    // platformEditOrganization fields (Organization Type is intentionally not reintroduced here -
    // this app keeps the existing `industry` taxonomy instead, per the earlier org-signup decision).
    orgName: z.string().min(2).max(150).optional(),
    industry: z.string().min(2).max(60).optional(),
    timezone: z.string().min(2).max(60).optional(),
    primaryContactMobile: z.string().min(6).max(15).optional()
  })
  .strict();
