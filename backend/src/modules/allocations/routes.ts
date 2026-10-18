import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenantTransaction } from '../../db/pool';
import { authenticate, requireRole, requireTenant } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { Errors } from '../../utils/errors';
import { writeAuditLog } from '../../services/audit';
import { allocateUnitToLead } from '../../services/allocation';
import { getVisibleLeadIds } from '../../services/leadVisibility';

const allocateBodySchema = z.object({ unitId: z.number().int().positive() }).strict();

export default async function allocationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req) => {
    const { orgId, userId } = requireTenant(req);
    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);
      if (visible.length === 0) return { data: [] };
      const res = await client.query(
        `SELECT l.lead_id, l.full_name, l.project_id, p.project_name,
                pu.unit_id, pu.unit_no, pu.allocation_date, rus.status_name AS unit_status
         FROM leads l
         JOIN ref_lead_statuses rs ON rs.status_id = l.status_id AND rs.status_name = 'Won'
         LEFT JOIN projects p ON p.project_id = l.project_id
         LEFT JOIN project_units pu ON pu.lead_id = l.lead_id AND pu.org_id = l.org_id
         LEFT JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
         WHERE l.org_id = $1 AND l.is_deleted = FALSE AND l.lead_id = ANY($2::int[])
         ORDER BY l.updated_at DESC`,
        [orgId, visible]
      );
      // frontend/src/api/types.ts Allocation: id, unitId, unitCode, projectId, projectName,
      // leadId, leadName, status, allocatedAt — not lead_id/full_name/unit_no/allocation_date.
      return {
        data: res.rows.map((r: any) => ({
          id: r.unit_id ?? r.lead_id,
          unitId: r.unit_id,
          unitCode: r.unit_no,
          projectId: r.project_id,
          projectName: r.project_name,
          leadId: r.lead_id,
          leadName: r.full_name,
          status: r.unit_status ?? (r.unit_id ? 'allocated' : 'pending'),
          allocatedAt: r.allocation_date
        }))
      };
    });
  });

  app.get('/:leadId/eligible-units', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId } = requireTenant(req);
    const leadId = parseInt((req.params as any).leadId, 10);

    return withTenantTransaction(orgId, async (client) => {
      const leadRes = await client.query(`SELECT project_id FROM leads WHERE lead_id = $1 AND org_id = $2 AND is_deleted = FALSE`, [
        leadId,
        orgId
      ]);
      if (leadRes.rows.length === 0) throw Errors.notFound('Lead not found');
      if (!leadRes.rows[0].project_id) return { data: [] };

      const res = await client.query(
        `SELECT pu.* FROM project_units pu JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
         WHERE pu.org_id = $1 AND pu.project_id = $2 AND rus.status_name = 'available' ORDER BY pu.unit_no`,
        [orgId, leadRes.rows[0].project_id]
      );
      return { data: res.rows };
    });
  });

  app.post('/:leadId/allocate', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const leadId = parseInt((req.params as any).leadId, 10);
    const body = parseOrThrow(allocateBodySchema, req.body);

    await withTenantTransaction(orgId, async (client) => {
      await allocateUnitToLead(client, orgId, body.unitId, leadId);
      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'UPDATE',
        tableName: 'project_units',
        recordId: body.unitId,
        newValues: { leadId, status: 'allocated' },
        ipAddress: req.ip
      });
    });
    return { data: { leadId, unitId: body.unitId, status: 'allocated' } };
  });
}
