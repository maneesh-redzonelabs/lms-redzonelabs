import { z } from 'zod';
import { mobileSchema, nullableEmailSchema, optionalEmailSchema } from '../../utils/validators';

export const listUsersQuerySchema = z
  .object({
    search: z.string().max(100).optional(),
    status: z.enum(['active', 'inactive', 'all']).optional(),
    page: z.string().optional(),
    pageSize: z.string().optional()
  })
  .strict();

// The frontend's CreateUserInput/patchUser (frontend/src/api/users.ts, Users.tsx) only ever
// sends { name, mobile, email, role, reportsTo } / { status }. It has no userType, companyName
// or initialPassword fields at all, so those are made optional here with sane defaults rather
// than rejecting every create from the UI. `reportsTo` is accepted in place of `managerId` and
// `name` in place of `fullName` to match what the UI actually posts; `status` ('active'|
// 'inactive') is accepted in place of the raw `isActive` boolean.
export const createUserSchema = z
  .object({
    name: z.string().min(2).max(100),
    mobile: mobileSchema,
    email: optionalEmailSchema,
    role: z.enum(['owner', 'manager', 'member']),
    reportsTo: z.coerce.number().int().positive().nullable().optional(),
    userType: z.enum(['Internal', 'External']).optional(),
    companyName: z.string().min(1).max(150).optional(),
    initialPassword: z.string().min(8).max(100).optional()
  })
  .strict()
  .refine((d) => d.role === 'owner' || !!d.reportsTo, {
    message: 'reportsTo is required for manager/member roles',
    path: ['reportsTo']
  });

export const updateUserSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    email: nullableEmailSchema,
    role: z.enum(['owner', 'manager', 'member']).optional(),
    reportsTo: z.coerce.number().int().positive().nullable().optional(),
    userType: z.enum(['Internal', 'External']).optional(),
    companyName: z.string().max(150).nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    isActive: z.boolean().optional()
  })
  .strict();
