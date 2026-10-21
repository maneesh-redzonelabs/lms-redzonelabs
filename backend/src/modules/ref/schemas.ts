import { z } from 'zod';

export const createRoleSchema = z
  .object({
    roleName: z.string().min(1).max(20),
    description: z.string().max(150).optional(),
    canCreateUsers: z.boolean().optional(),
    canCreateProjects: z.boolean().optional(),
    viewScope: z.enum(['own', 'team', 'all'])
  })
  .strict();
export const updateRoleSchema = createRoleSchema.partial();

export const createLeadStatusSchema = z
  .object({
    statusName: z.string().min(1).max(40),
    isTerminal: z.boolean().optional(),
    colourHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #rrggbb hex colour').optional(),
    sortOrder: z.coerce.number().int()
  })
  .strict();
export const updateLeadStatusSchema = createLeadStatusSchema.partial();

export const createProjectTypeSchema = z.object({ typeName: z.string().min(1).max(30) }).strict();
export const updateProjectTypeSchema = createProjectTypeSchema.partial();

export const createProjectStatusSchema = z.object({ statusName: z.string().min(1).max(30) }).strict();
export const updateProjectStatusSchema = createProjectStatusSchema.partial();

export const createUnitStatusSchema = z.object({ statusName: z.string().min(1).max(20) }).strict();
export const updateUnitStatusSchema = createUnitStatusSchema.partial();

export const createBudgetRangeSchema = z
  .object({
    label: z.string().min(1).max(25),
    minValue: z.coerce.number().min(0),
    maxValue: z.coerce.number().min(0).nullable().optional(),
    sortOrder: z.coerce.number().int()
  })
  .strict();
export const updateBudgetRangeSchema = createBudgetRangeSchema.partial();

export const createTimelineSchema = z
  .object({
    label: z.string().min(1).max(30),
    daysMax: z.coerce.number().int().nullable().optional(),
    sortOrder: z.coerce.number().int()
  })
  .strict();
export const updateTimelineSchema = createTimelineSchema.partial();

export const createIndustrySchema = z
  .object({
    industryName: z.string().min(1).max(60),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int()
  })
  .strict();
export const updateIndustrySchema = createIndustrySchema.partial();

export const createSubscriptionPlanSchema = z
  .object({
    planName: z.enum(['trial', 'starter', 'professional', 'enterprise']),
    description: z.string().max(200).optional(),
    pricePerUser: z.coerce.number().min(0),
    maxUsers: z.coerce.number().int().min(1),
    maxProjects: z.coerce.number().int().min(1),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int()
  })
  .strict();
export const updateSubscriptionPlanSchema = createSubscriptionPlanSchema.partial();
