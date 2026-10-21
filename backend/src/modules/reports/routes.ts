import { FastifyInstance } from 'fastify';
import { withTenantTransaction } from '../../db/pool';
import { authenticate, requireRole, requireTenant } from '../../middleware/auth';
import { getVisibleLeadIds } from '../../services/leadVisibility';

export default async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/project-conversion', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId } = requireTenant(req);
    return withTenantTransaction(orgId, async (client) => {
      const res = await client.query(`SELECT * FROM vw_project_conversion WHERE org_id = $1`, [orgId]);
      return { data: res.rows };
    });
  });

  // frontend/src/api/dashboard.ts SiteVisitRow: leadId, leadName, projectName, scheduledAt,
  // ownerName — vw_todays_site_visits exposes site_visit_date/assigned_to instead, and has no
  // single `scheduledAt`/`ownerName` field, so map explicitly rather than returning raw rows.
  app.get('/todays-site-visits', async (req) => {
    const { orgId, userId } = requireTenant(req);
    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);
      if (visible.length === 0) return { data: [] };
      const res = await client.query(
        `SELECT * FROM vw_todays_site_visits WHERE org_id = $1 AND lead_id = ANY($2::int[])`,
        [orgId, visible]
      );
      return {
        data: res.rows.map((r: any) => ({
          leadId: r.lead_id,
          leadName: r.lead_name,
          projectName: r.project_name,
          scheduledAt: r.site_visit_date,
          ownerName: r.assigned_to
        }))
      };
    });
  });
}
