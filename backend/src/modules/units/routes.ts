import { FastifyInstance } from 'fastify';
import { withTenantTransaction } from '../../db/pool';
import { authenticate, requireRole, requireStepUp, requireTenant } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { Errors } from '../../utils/errors';
import { writeAuditLog } from '../../services/audit';
import { allocateUnitToLead } from '../../services/allocation';
import { allocateSchema, underwriteSchema } from './schemas';

export default async function unitRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post('/:id/allocate', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const unitId = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(allocateSchema, req.body);

    await withTenantTransaction(orgId, async (client) => {
      await allocateUnitToLead(client, orgId, unitId, body.leadId);
      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'UPDATE',
        tableName: 'project_units',
        recordId: unitId,
        newValues: { leadId: body.leadId, status: 'allocated' },
        ipAddress: req.ip
      });
    });
    return { data: { unitId, leadId: body.leadId, status: 'allocated' } };
  });

  app.post('/:id/reallocate', { preHandler: requireRole('accountadmin') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const unitId = parseInt((req.params as any).id, 10);
    requireStepUp(req);

    const result = await withTenantTransaction(orgId, async (client) => {
      const unitRes = await client.query(
        `SELECT pu.*, rus.status_name FROM project_units pu JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
         WHERE pu.unit_id = $1 AND pu.org_id = $2`,
        [unitId, orgId]
      );
      if (unitRes.rows.length === 0) throw Errors.notFound('Unit not found');
      const unit = unitRes.rows[0];
      if (unit.status_name !== 'allocated') {
        throw Errors.validation({ unitId: 'Unit is not currently allocated' });
      }

      const availableStatus = await client.query(`SELECT status_id FROM ref_unit_statuses WHERE status_name = 'available'`);
      await client.query(
        `UPDATE project_units SET status_id = $1, lead_id = NULL, allocation_date = NULL WHERE unit_id = $2 AND org_id = $3`,
        [availableStatus.rows[0].status_id, unitId, orgId]
      );

      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'UPDATE',
        tableName: 'project_units',
        recordId: unitId,
        oldValues: { status: 'allocated', leadId: unit.lead_id },
        newValues: { status: 'available', leadId: null },
        ipAddress: req.ip
      });

      return { unitId, status: 'available' };
    });
    return { data: result };
  });

  app.get('/:id/underwriting', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId } = requireTenant(req);
    const unitId = parseInt((req.params as any).id, 10);
    return withTenantTransaction(orgId, async (client) => {
      const res = await client.query(
        `SELECT uw.*, u.full_name AS underwritten_by_name
         FROM unit_underwriting uw JOIN users u ON u.user_id = uw.underwritten_by
         WHERE uw.unit_id = $1 AND uw.org_id = $2 ORDER BY uw.created_at DESC`,
        [unitId, orgId]
      );
      return { data: res.rows };
    });
  });

  app.post('/:id/underwrite', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const unitId = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(underwriteSchema, req.body);

    const result = await withTenantTransaction(orgId, async (client) => {
      const unitRes = await client.query(
        `SELECT pu.*, rus.status_name FROM project_units pu JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
         WHERE pu.unit_id = $1 AND pu.org_id = $2`,
        [unitId, orgId]
      );
      if (unitRes.rows.length === 0) throw Errors.notFound('Unit not found');
      if (unitRes.rows[0].status_name !== 'available') {
        throw Errors.unitNotAvailable('Only available units can be placed on hold for underwriting');
      }

      const actorRes = await client.query(`SELECT user_type, company_name FROM users WHERE user_id = $1 AND org_id = $2`, [
        actorId,
        orgId
      ]);
      const actor = actorRes.rows[0];

      const holdStatus = await client.query(`SELECT status_id FROM ref_unit_statuses WHERE status_name = 'hold'`);
      await client.query(`UPDATE project_units SET status_id = $1 WHERE unit_id = $2 AND org_id = $3`, [
        holdStatus.rows[0].status_id,
        unitId,
        orgId
      ]);

      const uwRes = await client.query(
        `INSERT INTO unit_underwriting (org_id, unit_id, underwritten_by, user_type_snapshot, company_name_snapshot, duration_months, till_date, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,(CURRENT_DATE + ($6 || ' months')::INTERVAL)::DATE,$7)
         RETURNING *`,
        [orgId, unitId, actorId, actor.user_type, actor.company_name, body.durationMonths, body.remarks ?? null]
      );

      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'CREATE',
        tableName: 'unit_underwriting',
        recordId: uwRes.rows[0].underwriting_id,
        newValues: uwRes.rows[0],
        ipAddress: req.ip
      });

      return uwRes.rows[0];
    });
    return { data: result };
  });

  app.post('/:id/release-hold', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const unitId = parseInt((req.params as any).id, 10);

    const result = await withTenantTransaction(orgId, async (client) => {
      const unitRes = await client.query(
        `SELECT pu.*, rus.status_name FROM project_units pu JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
         WHERE pu.unit_id = $1 AND pu.org_id = $2`,
        [unitId, orgId]
      );
      if (unitRes.rows.length === 0) throw Errors.notFound('Unit not found');
      if (unitRes.rows[0].status_name !== 'hold') {
        throw Errors.validation({ unitId: 'Unit is not currently on hold' });
      }

      const availableStatus = await client.query(`SELECT status_id FROM ref_unit_statuses WHERE status_name = 'available'`);
      await client.query(`UPDATE project_units SET status_id = $1 WHERE unit_id = $2 AND org_id = $3`, [
        availableStatus.rows[0].status_id,
        unitId,
        orgId
      ]);
      await client.query(
        `UPDATE unit_underwriting SET released_at = CURRENT_TIMESTAMP WHERE unit_id = $1 AND org_id = $2 AND released_at IS NULL`,
        [unitId, orgId]
      );

      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'UPDATE',
        tableName: 'project_units',
        recordId: unitId,
        newValues: { status: 'available' },
        ipAddress: req.ip
      });

      return { unitId, status: 'available' };
    });
    return { data: result };
  });
}
