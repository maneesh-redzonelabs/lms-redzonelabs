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

  app.get('/todays-site-visits', async (req) => {
    const { orgId, userId } = requireTenant(req);
    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);
      if (visible.length === 0) return { data: [] };
      const res = await client.query(
        `SELECT * FROM vw_todays_site_visits WHERE org_id = $1 AND lead_id = ANY($2::int[])`,
        [orgId, visible]
      );
      return { data: res.rows };
    });
  });
}
