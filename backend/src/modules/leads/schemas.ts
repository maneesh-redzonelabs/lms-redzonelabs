import { z } from 'zod';

// NOTE on field names: the frontend (frontend/src/api/leads.ts, LeadFormModal.tsx,
// LeadDetailModal.tsx) sends `name`, `projectId` (string from a <select>), `budgetRange` /
// `timeline` (the ref-table `label`, not a numeric id), `source` (free text), and `ownerId`
// (not `fullName`/`budgetId`/`timelineId`/`leadSource`/`assignedTo`). The schemas below accept
// the frontend's actual contract; the route handler resolves budgetRange/timeline labels to
// their ids and maps ownerId -> assigned_to before hitting the DB.
export const createLeadSchema = z
  .object({
    name: z.string().min(2).max(100),
    mobile: z.string().regex(/^\d{10}$/),
    email: z.string().email().optional().or(z.literal('')),
    projectId: z.coerce.number().int().positive().optional(),
    budgetRange: z.string().max(25).optional().or(z.literal('')),
    timeline: z.string().max(30).optional().or(z.literal('')),
    status: z.string().max(40).optional(),
    ownerId: z.coerce.number().int().positive().optional(),
    followupDate: z.string().optional(),
    siteVisitDate: z.string().optional(),
    remarks: z.string().max(2000).optional(),
    source: z.string().max(100).optional().or(z.literal('')),
    leadScore: z.coerce.number().int().min(1).max(10).optional()
  })
  .strict();

export const updateLeadSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().nullable().optional(),
    projectId: z.coerce.number().int().positive().nullable().optional(),
    budgetRange: z.string().max(25).nullable().optional(),
    timeline: z.string().max(30).nullable().optional(),
    status: z.string().max(40).optional(),
    ownerId: z.coerce.number().int().positive().nullable().optional(),
    followupDate: z.string().nullable().optional(),
    siteVisitDate: z.string().nullable().optional(),
    remarks: z.string().max(2000).optional(),
    source: z.string().max(100).nullable().optional(),
    leadScore: z.coerce.number().int().min(1).max(10).optional(),
    confirm: z.boolean().optional()
  })
  .strict();

export const listLeadsQuerySchema = z
  .object({
    status: z.string().optional(),
    projectId: z.string().optional(),
    search: z.string().optional(),
    page: z.string().optional(),
    pageSize: z.string().optional(),
    sort: z.string().optional()
  })
  .strict();

export const activitySchema = z
  .object({
    activityType: z.enum(['call', 'email', 'whatsapp', 'site_visit', 'meeting', 'note']),
    subject: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
    activityDate: z.string(),
    durationMins: z.number().int().positive().optional(),
    outcome: z.string().max(200).optional(),
    nextAction: z.string().max(200).optional(),
    nextActionDate: z.string().optional()
  })
  .strict();

export const createSiteVisitSchema = z
  .object({
    leadId: z.number().int().positive(),
    projectId: z.number().int().positive(),
    scheduledDate: z.string(),
    conductedBy: z.number().int().positive(),
    visitStatus: z.enum(['scheduled', 'completed', 'cancelled', 'rescheduled']).optional(),
    interestedUnits: z.string().max(200).optional(),
    feedback: z.string().max(5000).optional(),
    nextSteps: z.string().max(5000).optional()
  })
  .strict();

export const updateSiteVisitSchema = z
  .object({
    scheduledDate: z.string().optional(),
    actualDate: z.string().nullable().optional(),
    visitStatus: z.enum(['scheduled', 'completed', 'cancelled', 'rescheduled']).optional(),
    interestedUnits: z.string().max(200).nullable().optional(),
    feedback: z.string().max(5000).nullable().optional(),
    nextSteps: z.string().max(5000).nullable().optional()
  })
  .strict();
