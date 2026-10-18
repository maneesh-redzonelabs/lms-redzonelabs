import { FastifyInstance } from 'fastify';
import { withTenantTransaction } from '../../db/pool';
import { requireTenant } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { Errors } from '../../utils/errors';
import { listEnvelope, parsePagination } from '../../utils/pagination';
import { writeAuditLog } from '../../services/audit';
import { getVisibleLeadIds } from '../../services/leadVisibility';
import { createSiteVisitSchema, updateSiteVisitSchema } from './schemas';

export default function registerSiteVisitRoutes(app: FastifyInstance) {
  app.get('/site-visits', async (req) => {
    const { orgId, userId } = requireTenant(req);
    const { page, pageSize, offset } = parsePagination(req.query);
    const dateParam = (req.query as any)?.date as string | undefined;

    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);
      if (visible.length === 0) return listEnvelope([], page, pageSize, 0);

      const conditions = ['sv.org_id = $1', 'sv.lead_id = ANY($2::int[])'];
      const params: any[] = [orgId, visible];
      if (dateParam === 'today') {
        conditions.push('sv.scheduled_date::date = CURRENT_DATE');
      } else if (dateParam) {
        params.push(dateParam);
        conditions.push(`sv.scheduled_date::date = $${params.length}::date`);
      }
      const where = conditions.join(' AND ');

      const countRes = await client.query(`SELECT COUNT(*) FROM site_visits sv WHERE ${where}`, params);
      params.push(pageSize, offset);
      const rows = await client.query(
        `SELECT sv.*, l.full_name AS lead_name, p.project_name, u.full_name AS conducted_by_name
         FROM site_visits sv
         JOIN leads l ON l.lead_id = sv.lead_id
         JOIN projects p ON p.project_id = sv.project_id
         JOIN users u ON u.user_id = sv.conducted_by
         WHERE ${where} ORDER BY sv.scheduled_date LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return listEnvelope(rows.rows, page, pageSize, parseInt(countRes.rows[0].count, 10));
    });
  });

  app.post('/site-visits', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const body = parseOrThrow(createSiteVisitSchema, req.body);

    const result = await withTenantTransaction(orgId, async (client) => {
      const leadRes = await client.query(`SELECT lead_id FROM leads WHERE lead_id = $1 AND org_id = $2 AND is_deleted = FALSE`, [
        body.leadId,
        orgId
      ]);
      if (leadRes.rows.length === 0) throw Errors.notFound('Lead not found');

      const res = await client.query(
        `INSERT INTO site_visits (org_id, lead_id, project_id, scheduled_date, conducted_by, visit_status, interested_units, feedback, next_steps, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          orgId,
          body.leadId,
          body.projectId,
          body.scheduledDate,
          body.conductedBy,
          body.visitStatus ?? 'scheduled',
          body.interestedUnits ?? null,
          body.feedback ?? null,
          body.nextSteps ?? null,
          actorId
        ]
      );

      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'CREATE',
        tableName: 'site_visits',
        recordId: res.rows[0].visit_id,
        ipAddress: req.ip
      });

      return res.rows[0];
    });
    return { data: result };
  });

  app.patch('/site-visits/:id', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateSiteVisitSchema, req.body);

    const result = await withTenantTransaction(orgId, async (client) => {
      const existing = await client.query(`SELECT * FROM site_visits WHERE visit_id = $1 AND org_id = $2`, [id, orgId]);
      if (existing.rows.length === 0) throw Errors.notFound('Site visit not found');

      const colMap: Record<string, string> = {
        scheduledDate: 'scheduled_date',
        actualDate: 'actual_date',
        visitStatus: 'visit_status',
        interestedUnits: 'interested_units',
        feedback: 'feedback',
        nextSteps: 'next_steps'
      };
      const sets: string[] = [];
      const params: any[] = [];
      for (const [key, col] of Object.entries(colMap)) {
        if ((body as any)[key] !== undefined) {
          params.push((body as any)[key]);
          sets.push(`${col} = $${params.length}`);
        }
      }
      if (sets.length > 0) {
        params.push(id, orgId);
        await client.query(
          `UPDATE site_visits SET ${sets.join(', ')} WHERE visit_id = $${params.length - 1} AND org_id = $${params.length}`,
          params
        );
      }

      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'UPDATE',
        tableName: 'site_visits',
        recordId: id,
        oldValues: existing.rows[0],
        newValues: body,
        ipAddress: req.ip
      });

      const res = await client.query(`SELECT * FROM site_visits WHERE visit_id = $1 AND org_id = $2`, [id, orgId]);
      return res.rows[0];
    });
    return { data: result };
  });
}
