import { z } from 'zod';

const apartmentTowerSchema = z
  .object({
    tower: z.string().min(1).max(10),
    floors: z.number().int().positive().max(200),
    unitsPerFloor: z.number().int().positive().max(100)
  })
  .strict();

const plotConfigSchema = z
  .object({
    prefix: z.string().min(1).max(10),
    count: z.number().int().positive().max(2000),
    startNumber: z.number().int().nonnegative()
  })
  .strict();

export const initialInventorySchema = z
  .union([
    z.object({ style: z.literal('apartment'), towers: z.array(apartmentTowerSchema).min(1) }).strict(),
    z.object({ style: z.literal('plot'), plot: plotConfigSchema }).strict()
  ])
  .optional();

// The frontend (frontend/src/api/projects.ts CreateProjectInput, Projects.tsx) sends
// { name, type, status, location, initialInventory } where `type`/`status` are the ref-table
// `code` (= type_name/status_name, see modules/ref/routes.ts) and there is no `city` field or
// numeric typeId/statusId at all. It also sends `initialInventory` in a flat shape
// ({ mode: 'apartment'|'plot', tower, floors, unitsPerFloor, plotPrefix, plotCount,
// plotStartNumber }), not the nested { style, towers: [...] } / { style, plot: {...} } shape
// `generateUnitNumbers` expects — the route handler translates between the two.
const frontendInventoryBatchSchema = z
  .object({
    mode: z.enum(['apartment', 'plot']),
    tower: z.string().max(10).optional(),
    floors: z.number().int().positive().max(200).optional(),
    unitsPerFloor: z.number().int().positive().max(100).optional(),
    plotPrefix: z.string().max(10).optional(),
    plotCount: z.number().int().positive().max(2000).optional(),
    plotStartNumber: z.number().int().nonnegative().optional()
  })
  .strict();

export const createProjectSchema = z
  .object({
    name: z.string().min(2).max(150),
    type: z.string().max(60).optional().or(z.literal('')),
    status: z.string().max(60).optional().or(z.literal('')),
    location: z.string().max(200).optional().or(z.literal('')),
    city: z.string().max(80).optional().or(z.literal('')),
    description: z.string().max(5000).optional(),
    reraNumber: z.string().max(50).optional(),
    totalUnits: z.number().int().nonnegative().optional(),
    pricePerSqft: z.number().nonnegative().optional(),
    possessionDate: z.string().optional(),
    initialInventory: frontendInventoryBatchSchema.optional()
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().min(2).max(150).optional(),
    location: z.string().min(1).max(200).nullable().optional(),
    city: z.string().max(80).nullable().optional(),
    type: z.string().max(60).nullable().optional(),
    status: z.string().max(60).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    reraNumber: z.string().max(50).nullable().optional(),
    totalUnits: z.number().int().nonnegative().nullable().optional(),
    pricePerSqft: z.number().nonnegative().nullable().optional(),
    possessionDate: z.string().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict();

export const addUnitsSchema = frontendInventoryBatchSchema;

/** Converts the frontend's flat InitialInventoryBatch into generateUnitNumbers' InventoryRequest. */
export function toInventoryRequest(batch: z.infer<typeof frontendInventoryBatchSchema>) {
  if (batch.mode === 'apartment') {
    return {
      style: 'apartment' as const,
      towers: [
        {
          tower: batch.tower || 'T1',
          floors: batch.floors ?? 1,
          unitsPerFloor: batch.unitsPerFloor ?? 1
        }
      ]
    };
  }
  return {
    style: 'plot' as const,
    plot: {
      prefix: batch.plotPrefix || 'P',
      count: batch.plotCount ?? 1,
      startNumber: batch.plotStartNumber ?? 1
    }
  };
}

export const listUnitsQuerySchema = z.object({ status: z.string().optional() }).strict();
