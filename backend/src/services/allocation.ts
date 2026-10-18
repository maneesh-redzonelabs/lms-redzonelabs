import { PoolClient } from 'pg';
import { Errors } from '../utils/errors';

/** Shared allocate logic used by both POST /units/{id}/allocate and POST /allocations/{leadId}/allocate. */
export async function allocateUnitToLead(
  client: PoolClient,
  orgId: number,
  unitId: number,
  leadId: number
): Promise<void> {
  const unitRes = await client.query(
    `SELECT pu.unit_id, pu.project_id, pu.status_id, rus.status_name
     FROM project_units pu JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
     WHERE pu.unit_id = $1 AND pu.org_id = $2`,
    [unitId, orgId]
  );
  if (unitRes.rows.length === 0) throw Errors.notFound('Unit not found');
  const unit = unitRes.rows[0];
  if (unit.status_name !== 'available') throw Errors.unitNotAvailable('Unit is not available for allocation');

  const leadRes = await client.query(
    `SELECT l.lead_id, l.project_id, rs.status_name
     FROM leads l JOIN ref_lead_statuses rs ON rs.status_id = l.status_id
     WHERE l.lead_id = $1 AND l.org_id = $2 AND l.is_deleted = FALSE`,
    [leadId, orgId]
  );
  if (leadRes.rows.length === 0) throw Errors.notFound('Lead not found');
  const lead = leadRes.rows[0];
  if (lead.status_name !== 'Won') throw Errors.validation({ leadId: 'Lead must be in Won status to allocate a unit' });
  if (lead.project_id !== unit.project_id) {
    throw Errors.validation({ unitId: 'Unit must belong to the same project as the lead' });
  }

  const existingAlloc = await client.query(
    `SELECT unit_id FROM project_units WHERE org_id = $1 AND lead_id = $2`,
    [orgId, leadId]
  );
  if (existingAlloc.rows.length > 0) {
    throw Errors.validation({ leadId: 'Lead already has an allocated unit' });
  }

  const allocatedStatus = await client.query(`SELECT status_id FROM ref_unit_statuses WHERE status_name = 'allocated'`);
  await client.query(`UPDATE project_units SET status_id = $1, lead_id = $2 WHERE unit_id = $3 AND org_id = $4`, [
    allocatedStatus.rows[0].status_id,
    leadId,
    unitId,
    orgId
  ]);
}
