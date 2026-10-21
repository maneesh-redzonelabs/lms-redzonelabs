import { FastifyInstance } from 'fastify';
import { withTenantTransaction } from '../../db/pool';
import { authenticate, requireRole, requireTenant } from '../../middleware/auth';
import { getVisibleLeadIds } from '../../services/leadVisibility';
import { mapProjectRow, PROJECT_WITH_COUNTS_SELECT } from '../projects/routes';

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // frontend/src/api/types.ts DashboardSummary: totalLeads, newLeadsToday, wonLeads, lostLeads,
  // siteVisitsToday, openLeads, leadsByStatus, projects (Project[]) — the previous response
  // shape (users/projects quota/inventory/leads.wonTotal) had none of these fields.
  app.get('/summary', async (req) => {
    const { orgId, userId } = requireTenant(req);
    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);

      let totalLeads = 0;
      let newLeadsToday = 0;
      let wonLeads = 0;
      let lostLeads = 0;
      let siteVisitsToday = 0;
      const leadsByStatus: Record<string, number> = {};

      if (visible.length > 0) {
        // site_visit_date is cast to text here rather than left as a DATE: pg's default DATE
        // parser builds the JS Date using the Node process's LOCAL timezone (new Date(y, m, d)),
        // not UTC, so later calling .toISOString() on it re-renders in UTC and silently shifts
        // the day whenever the process isn't running in UTC (e.g. a server set to IST shifts it
        // back by a day). Comparing the raw 'YYYY-MM-DD' text avoids that round-trip entirely.
        const leadsRes = await client.query(
          `SELECT l.lead_id, l.created_at, l.site_visit_date::text AS site_visit_date, rs.status_name
           FROM leads l JOIN ref_lead_statuses rs ON rs.status_id = l.status_id
           WHERE l.org_id = $1 AND l.is_deleted = FALSE AND l.lead_id = ANY($2::int[])`,
          [orgId, visible]
        );
        // "Today" must be the org's local calendar date (Asia/Kolkata), not UTC: toISOString()
        // always returns the UTC date, which is still "yesterday" until 5:30am IST, so between
        // midnight and 5:30am IST this undercounted (or missed entirely) leads and site visits
        // dated "today" in India. en-CA locale formats as YYYY-MM-DD.
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        for (const row of leadsRes.rows) {
          totalLeads++;
          leadsByStatus[row.status_name] = (leadsByStatus[row.status_name] ?? 0) + 1;
          if (row.status_name === 'Won') wonLeads++;
          if (row.status_name === 'Lost') lostLeads++;
          // created_at is a timestamptz, so its date-of-day also depends on IST, not UTC.
          if (row.created_at && new Date(row.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayStr) {
            newLeadsToday++;
          }
          if (row.site_visit_date === todayStr) {
            siteVisitsToday++;
          }
        }
      }
      const openLeads = Math.max(0, totalLeads - wonLeads - lostLeads);

      const projectsRes = await client.query(
        `${PROJECT_WITH_COUNTS_SELECT} WHERE p.org_id = $1 AND p.is_active = TRUE
         GROUP BY p.project_id, pt.type_name, ps.status_name ORDER BY p.created_at DESC LIMIT 50`,
        [orgId]
      );

      return {
        data: {
          totalLeads,
          newLeadsToday,
          wonLeads,
          lostLeads,
          siteVisitsToday,
          openLeads,
          leadsByStatus,
          projects: projectsRes.rows.map(mapProjectRow)
        }
      };
    });
  });

  // frontend/src/api/types.ts UsersBreakdown[]: userId, userName, totalLeads, openLeads,
  // wonLeads — the previous response was a single aggregate object, not a per-user array.
  app.get('/users-breakdown', { preHandler: requireRole('accountadmin') }, async (req) => {
    const { orgId } = requireTenant(req);
    return withTenantTransaction(orgId, async (client) => {
      const res = await client.query(
        `SELECT u.user_id, u.full_name,
                COUNT(l.lead_id) AS total_leads,
                COUNT(l.lead_id) FILTER (WHERE rs.status_name NOT IN ('Won','Lost')) AS open_leads,
                COUNT(l.lead_id) FILTER (WHERE rs.status_name = 'Won') AS won_leads
         FROM users u
         LEFT JOIN leads l ON l.assigned_to = u.user_id AND l.org_id = u.org_id AND l.is_deleted = FALSE
         LEFT JOIN ref_lead_statuses rs ON rs.status_id = l.status_id
         WHERE u.org_id = $1 AND u.is_active = TRUE
         GROUP BY u.user_id, u.full_name
         ORDER BY u.full_name`,
        [orgId]
      );
      return {
        data: res.rows.map((r: any) => ({
          userId: r.user_id,
          userName: r.full_name,
          totalLeads: Number(r.total_leads),
          openLeads: Number(r.open_leads),
          wonLeads: Number(r.won_leads)
        }))
      };
    });
  });
}
