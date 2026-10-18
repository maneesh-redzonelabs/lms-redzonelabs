import { FastifyInstance } from 'fastify';
import { pool } from '../../db/pool';
import { env } from '../../config/env';

async function q(sql: string) {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${env.pg.schema}, public`);
    const result = await client.query(sql);
    return result.rows;
  } finally {
    client.release();
  }
}

// The frontend's reference-data hook (useReferenceData) expects every /ref/* endpoint to
// return a flat array of { code, label } options — it uses `code` as both the React key and
// the value round-tripped back to the backend (e.g. lead status name, budget range label).
// The raw ref_* tables expose richer columns (ids, sort order, colours, etc.) for internal use,
// so each handler below maps its natural "name" column to `code` while keeping the extra
// columns available alongside for any UI that wants them.
export default async function refRoutes(app: FastifyInstance) {
  app.get('/roles', async () => ({
    data: (
      await q(`SELECT role_id, role_name, description, can_create_users, can_create_projects, view_scope FROM ref_roles ORDER BY role_id`)
    ).map((r) => ({ code: r.role_name, label: r.description || r.role_name, ...r }))
  }));

  app.get('/lead-statuses', async () => ({
    data: (
      await q(`SELECT status_id, status_name, is_terminal, colour_hex, sort_order FROM ref_lead_statuses ORDER BY sort_order`)
    ).map((r) => ({ code: r.status_name, label: r.status_name, ...r }))
  }));

  app.get('/project-types', async () => ({
    data: (await q(`SELECT type_id, type_name FROM ref_project_types ORDER BY type_id`)).map((r) => ({
      code: r.type_name,
      label: r.type_name,
      ...r
    }))
  }));

  app.get('/project-statuses', async () => ({
    data: (await q(`SELECT status_id, status_name FROM ref_project_statuses ORDER BY status_id`)).map((r) => ({
      code: r.status_name,
      label: r.status_name,
      ...r
    }))
  }));

  app.get('/unit-statuses', async () => ({
    data: (await q(`SELECT status_id, status_name FROM ref_unit_statuses ORDER BY status_id`)).map((r) => ({
      code: r.status_name,
      label: r.status_name,
      ...r
    }))
  }));

  app.get('/budget-ranges', async () => ({
    data: (
      await q(`SELECT budget_id, label, min_value, max_value, sort_order FROM ref_budget_ranges ORDER BY sort_order`)
    ).map((r) => ({ code: r.label, label: r.label, ...r }))
  }));

  app.get('/timelines', async () => ({
    data: (await q(`SELECT timeline_id, label, days_max, sort_order FROM ref_timelines ORDER BY sort_order`)).map((r) => ({
      code: r.label,
      label: r.label,
      ...r
    }))
  }));

  app.get('/industries', async () => ({
    data: (
      await q(`SELECT industry_id, industry_name, sort_order FROM ref_industries WHERE is_active = TRUE ORDER BY sort_order`)
    ).map((r) => ({ code: r.industry_name, label: r.industry_name, ...r }))
  }));

  app.get('/subscription-plans', async () => ({
    data: (
      await q(
        `SELECT plan_id, plan_name, description, price_per_user, max_users, max_projects, sort_order FROM ref_subscription_plans WHERE is_active = TRUE ORDER BY sort_order`
      )
    ).map((r) => ({ code: r.plan_name, label: r.plan_name, ...r }))
  }));
}
