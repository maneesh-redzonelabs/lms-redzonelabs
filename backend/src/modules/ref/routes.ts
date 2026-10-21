import { FastifyInstance } from 'fastify';
import { pool } from '../../db/pool';
import { env } from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { translatePgError } from '../../utils/errors';
import {
  createRoleSchema,
  updateRoleSchema,
  createLeadStatusSchema,
  updateLeadStatusSchema,
  createProjectTypeSchema,
  updateProjectTypeSchema,
  createProjectStatusSchema,
  updateProjectStatusSchema,
  createUnitStatusSchema,
  updateUnitStatusSchema,
  createBudgetRangeSchema,
  updateBudgetRangeSchema,
  createTimelineSchema,
  updateTimelineSchema,
  createIndustrySchema,
  updateIndustrySchema,
  createSubscriptionPlanSchema,
  updateSubscriptionPlanSchema
} from './schemas';

async function q(sql: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${env.pg.schema}, public`);
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// Generic insert/update for the ref_* lookup tables: table/column names below are always
// hardcoded literals (never user input), so building the SQL text with them is safe; only
// values are ever parameterized.
async function insertRow(table: string, idColumn: string, data: Record<string, any>): Promise<number> {
  const cols = Object.keys(data);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const rows = await q(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${idColumn}`,
    cols.map((c) => data[c])
  );
  return rows[0][idColumn];
}

async function updateRow(table: string, idColumn: string, id: number, data: Record<string, any>): Promise<void> {
  const cols = Object.keys(data);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  await q(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${idColumn} = $${cols.length + 1}`, [
    ...cols.map((c) => data[c]),
    id
  ]);
}

function mapDefined(input: Record<string, any>, keyMap: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [jsonKey, column] of Object.entries(keyMap)) {
    if (input[jsonKey] !== undefined) out[column] = input[jsonKey];
  }
  return out;
}

// The frontend's reference-data hook (useReferenceData) expects every /ref/* endpoint to
// return a flat array of { code, label } options — it uses `code` as both the React key and
// the value round-tripped back to the backend (e.g. lead status name, budget range label).
// The raw ref_* tables expose richer columns (ids, sort order, colours, etc.) for internal use,
// so each handler below maps its natural "name" column to `code` while keeping the extra
// columns available alongside for any UI that wants them.
//
// GET endpoints are public (every org needs these lookups for dropdowns). Create/update are
// restricted to platformadmin, since these masters are shared platform-wide configuration.
export default async function refRoutes(app: FastifyInstance) {
  const platformOnly = { preHandler: [authenticate, requireRole('platformadmin')] };

  app.get('/roles', async () => ({
    data: (
      await q(`SELECT role_id, role_name, description, can_create_users, can_create_projects, view_scope FROM ref_roles ORDER BY role_id`)
    ).map((r) => ({ code: r.role_name, label: r.description || r.role_name, ...r }))
  }));

  app.post('/roles', platformOnly, async (req) => {
    const body = parseOrThrow(createRoleSchema, req.body);
    try {
      const id = await insertRow('ref_roles', 'role_id', {
        role_name: body.roleName,
        description: body.description ?? null,
        can_create_users: body.canCreateUsers ?? false,
        can_create_projects: body.canCreateProjects ?? false,
        view_scope: body.viewScope
      });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/roles/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateRoleSchema, req.body);
    try {
      await updateRow(
        'ref_roles',
        'role_id',
        id,
        mapDefined(body, {
          roleName: 'role_name',
          description: 'description',
          canCreateUsers: 'can_create_users',
          canCreateProjects: 'can_create_projects',
          viewScope: 'view_scope'
        })
      );
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.get('/lead-statuses', async () => ({
    data: (
      await q(`SELECT status_id, status_name, is_terminal, colour_hex, sort_order FROM ref_lead_statuses ORDER BY sort_order`)
    ).map((r) => ({ code: r.status_name, label: r.status_name, ...r }))
  }));

  app.post('/lead-statuses', platformOnly, async (req) => {
    const body = parseOrThrow(createLeadStatusSchema, req.body);
    try {
      const id = await insertRow('ref_lead_statuses', 'status_id', {
        status_name: body.statusName,
        is_terminal: body.isTerminal ?? false,
        colour_hex: body.colourHex ?? null,
        sort_order: body.sortOrder
      });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/lead-statuses/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateLeadStatusSchema, req.body);
    try {
      await updateRow(
        'ref_lead_statuses',
        'status_id',
        id,
        mapDefined(body, {
          statusName: 'status_name',
          isTerminal: 'is_terminal',
          colourHex: 'colour_hex',
          sortOrder: 'sort_order'
        })
      );
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.get('/project-types', async () => ({
    data: (await q(`SELECT type_id, type_name FROM ref_project_types ORDER BY type_id`)).map((r) => ({
      code: r.type_name,
      label: r.type_name,
      ...r
    }))
  }));

  app.post('/project-types', platformOnly, async (req) => {
    const body = parseOrThrow(createProjectTypeSchema, req.body);
    try {
      const id = await insertRow('ref_project_types', 'type_id', { type_name: body.typeName });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/project-types/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateProjectTypeSchema, req.body);
    try {
      await updateRow('ref_project_types', 'type_id', id, mapDefined(body, { typeName: 'type_name' }));
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.get('/project-statuses', async () => ({
    data: (await q(`SELECT status_id, status_name FROM ref_project_statuses ORDER BY status_id`)).map((r) => ({
      code: r.status_name,
      label: r.status_name,
      ...r
    }))
  }));

  app.post('/project-statuses', platformOnly, async (req) => {
    const body = parseOrThrow(createProjectStatusSchema, req.body);
    try {
      const id = await insertRow('ref_project_statuses', 'status_id', { status_name: body.statusName });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/project-statuses/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateProjectStatusSchema, req.body);
    try {
      await updateRow('ref_project_statuses', 'status_id', id, mapDefined(body, { statusName: 'status_name' }));
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.get('/unit-statuses', async () => ({
    data: (await q(`SELECT status_id, status_name FROM ref_unit_statuses ORDER BY status_id`)).map((r) => ({
      code: r.status_name,
      label: r.status_name,
      ...r
    }))
  }));

  app.post('/unit-statuses', platformOnly, async (req) => {
    const body = parseOrThrow(createUnitStatusSchema, req.body);
    try {
      const id = await insertRow('ref_unit_statuses', 'status_id', { status_name: body.statusName });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/unit-statuses/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateUnitStatusSchema, req.body);
    try {
      await updateRow('ref_unit_statuses', 'status_id', id, mapDefined(body, { statusName: 'status_name' }));
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.get('/budget-ranges', async () => ({
    data: (
      await q(`SELECT budget_id, label, min_value, max_value, sort_order FROM ref_budget_ranges ORDER BY sort_order`)
    ).map((r) => ({ code: r.label, label: r.label, ...r }))
  }));

  app.post('/budget-ranges', platformOnly, async (req) => {
    const body = parseOrThrow(createBudgetRangeSchema, req.body);
    try {
      const id = await insertRow('ref_budget_ranges', 'budget_id', {
        label: body.label,
        min_value: body.minValue,
        max_value: body.maxValue ?? null,
        sort_order: body.sortOrder
      });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/budget-ranges/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateBudgetRangeSchema, req.body);
    try {
      await updateRow(
        'ref_budget_ranges',
        'budget_id',
        id,
        mapDefined(body, { label: 'label', minValue: 'min_value', maxValue: 'max_value', sortOrder: 'sort_order' })
      );
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.get('/timelines', async () => ({
    data: (await q(`SELECT timeline_id, label, days_max, sort_order FROM ref_timelines ORDER BY sort_order`)).map((r) => ({
      code: r.label,
      label: r.label,
      ...r
    }))
  }));

  app.post('/timelines', platformOnly, async (req) => {
    const body = parseOrThrow(createTimelineSchema, req.body);
    try {
      const id = await insertRow('ref_timelines', 'timeline_id', {
        label: body.label,
        days_max: body.daysMax ?? null,
        sort_order: body.sortOrder
      });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/timelines/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateTimelineSchema, req.body);
    try {
      await updateRow(
        'ref_timelines',
        'timeline_id',
        id,
        mapDefined(body, { label: 'label', daysMax: 'days_max', sortOrder: 'sort_order' })
      );
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.get('/industries', async () => ({
    data: (
      await q(`SELECT industry_id, industry_name, sort_order FROM ref_industries WHERE is_active = TRUE ORDER BY sort_order`)
    ).map((r) => ({ code: r.industry_name, label: r.industry_name, ...r }))
  }));

  app.post('/industries', platformOnly, async (req) => {
    const body = parseOrThrow(createIndustrySchema, req.body);
    try {
      const id = await insertRow('ref_industries', 'industry_id', {
        industry_name: body.industryName,
        is_active: body.isActive ?? true,
        sort_order: body.sortOrder
      });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/industries/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateIndustrySchema, req.body);
    try {
      await updateRow(
        'ref_industries',
        'industry_id',
        id,
        mapDefined(body, { industryName: 'industry_name', isActive: 'is_active', sortOrder: 'sort_order' })
      );
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.get('/subscription-plans', async () => ({
    data: (
      await q(
        `SELECT plan_id, plan_name, description, price_per_user, max_users, max_projects, sort_order FROM ref_subscription_plans WHERE is_active = TRUE ORDER BY sort_order`
      )
    ).map((r) => ({ code: r.plan_name, label: r.plan_name, ...r }))
  }));

  app.post('/subscription-plans', platformOnly, async (req) => {
    const body = parseOrThrow(createSubscriptionPlanSchema, req.body);
    try {
      const id = await insertRow('ref_subscription_plans', 'plan_id', {
        plan_name: body.planName,
        description: body.description ?? null,
        price_per_user: body.pricePerUser,
        max_users: body.maxUsers,
        max_projects: body.maxProjects,
        is_active: body.isActive ?? true,
        sort_order: body.sortOrder
      });
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });

  app.patch('/subscription-plans/:id', platformOnly, async (req) => {
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateSubscriptionPlanSchema, req.body);
    try {
      await updateRow(
        'ref_subscription_plans',
        'plan_id',
        id,
        mapDefined(body, {
          planName: 'plan_name',
          description: 'description',
          pricePerUser: 'price_per_user',
          maxUsers: 'max_users',
          maxProjects: 'max_projects',
          isActive: 'is_active',
          sortOrder: 'sort_order'
        })
      );
      return { data: { id } };
    } catch (err) {
      throw translatePgError(err) ?? err;
    }
  });
}
