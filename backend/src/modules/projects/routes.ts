import { FastifyInstance } from 'fastify';
import { withTenantTransaction } from '../../db/pool';
import { authenticate, requireRole, requireTenant } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { Errors, translatePgError } from '../../utils/errors';
import { parsePagination, listEnvelope, parseSort } from '../../utils/pagination';
import { writeAuditLog } from '../../services/audit';
import { generateUnitNumbers } from '../../services/unitGenerator';
import { addUnitsSchema, createProjectSchema, toInventoryRequest, updateProjectSchema } from './schemas';

const SORT_WHITELIST: Record<string, string> = {
  name: 'p.project_name',
  createdAt: 'p.created_at',
  city: 'p.city'
};

// frontend/src/api/types.ts Project: id, name, type, status, location, totalUnits,
// availableUnits, heldUnits, soldUnits, createdAt — not project_name/type_name/status_name, and
// unit-status counts are not present on the raw `projects` row at all.
export function mapProjectRow(row: any) {
  if (!row) return row;
  return {
    id: row.project_id,
    name: row.project_name,
    type: row.type_name,
    status: row.status_name,
    location: row.location,
    city: row.city,
    totalUnits: row.total_units_actual !== undefined ? Number(row.total_units_actual) : row.total_units,
    availableUnits: row.available_units !== undefined ? Number(row.available_units) : undefined,
    heldUnits: row.held_units !== undefined ? Number(row.held_units) : undefined,
    soldUnits: row.sold_units !== undefined ? Number(row.sold_units) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reraNumber: row.rera_number,
    pricePerSqft: row.price_per_sqft,
    possessionDate: row.possession_date
  };
}

export const PROJECT_WITH_COUNTS_SELECT = `
  SELECT p.*, pt.type_name, ps.status_name,
         COUNT(pu.unit_id) AS total_units_actual,
         COUNT(pu.unit_id) FILTER (WHERE rus.status_name = 'available') AS available_units,
         COUNT(pu.unit_id) FILTER (WHERE rus.status_name = 'hold') AS held_units,
         COUNT(pu.unit_id) FILTER (WHERE rus.status_name = 'sold') AS sold_units
  FROM projects p
  LEFT JOIN ref_project_types pt ON pt.type_id = p.type_id
  LEFT JOIN ref_project_statuses ps ON ps.status_id = p.status_id
  LEFT JOIN project_units pu ON pu.project_id = p.project_id AND pu.org_id = p.org_id
  LEFT JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
`;

export default async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId } = requireTenant(req);
    const { page, pageSize, offset } = parsePagination(req.query);
    const order = parseSort((req.query as any)?.sort, SORT_WHITELIST, 'p.created_at DESC');

    return withTenantTransaction(orgId, async (client) => {
      const countRes = await client.query(`SELECT COUNT(*) FROM projects p WHERE p.org_id = $1`, [orgId]);
      const rows = await client.query(
        `${PROJECT_WITH_COUNTS_SELECT}
         WHERE p.org_id = $1
         GROUP BY p.project_id, pt.type_name, ps.status_name
         ORDER BY ${order} LIMIT $2 OFFSET $3`,
        [orgId, pageSize, offset]
      );
      return listEnvelope(rows.rows.map(mapProjectRow), page, pageSize, parseInt(countRes.rows[0].count, 10));
    });
  });

  app.get('/:id', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    return withTenantTransaction(orgId, async (client) => {
      const res = await client.query(
        `${PROJECT_WITH_COUNTS_SELECT}
         WHERE p.project_id = $1 AND p.org_id = $2
         GROUP BY p.project_id, pt.type_name, ps.status_name`,
        [id, orgId]
      );
      if (res.rows.length === 0) throw Errors.notFound('Project not found');
      return { data: mapProjectRow(res.rows[0]) };
    });
  });

  app.post('/', { preHandler: requireRole('accountadmin') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const body = parseOrThrow(createProjectSchema, req.body);

    try {
      const result = await withTenantTransaction(orgId, async (client) => {
        const typeId = body.type
          ? (await client.query(`SELECT type_id FROM ref_project_types WHERE type_name = $1`, [body.type])).rows[0]
              ?.type_id ?? null
          : null;
        const statusId = body.status
          ? (await client.query(`SELECT status_id FROM ref_project_statuses WHERE status_name = $1`, [body.status]))
              .rows[0]?.status_id ?? null
          : null;

        const insertRes = await client.query(
          `INSERT INTO projects (org_id, project_name, location, city, type_id, status_id, description, rera_number, total_units, price_per_sqft, possession_date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            orgId,
            body.name,
            body.location || 'N/A',
            body.city || body.location || 'N/A',
            typeId,
            statusId,
            body.description ?? null,
            body.reraNumber ?? null,
            body.totalUnits ?? null,
            body.pricePerSqft ?? null,
            body.possessionDate ?? null,
            actorId
          ]
        );
        const project = insertRes.rows[0];

        let unitsCreated = 0;
        if (body.initialInventory) {
          const units = generateUnitNumbers(toInventoryRequest(body.initialInventory));
          for (const u of units) {
            await client.query(
              `INSERT INTO project_units (org_id, project_id, unit_no, tower, floor, status_id)
               VALUES ($1,$2,$3,$4,$5,(SELECT status_id FROM ref_unit_statuses WHERE status_name='available'))`,
              [orgId, project.project_id, u.unitNo, u.tower, u.floor]
            );
          }
          unitsCreated = units.length;
        }

        await writeAuditLog(client, {
          orgId,
          userId: actorId,
          action: 'CREATE',
          tableName: 'projects',
          recordId: project.project_id,
          newValues: { project_name: project.project_name, unitsCreated },
          ipAddress: req.ip
        });

        return {
          ...mapProjectRow({ ...project, type_name: body.type, status_name: body.status }),
          unitsCreated
        };
      });
      return { data: result };
    } catch (err) {
      const mapped = translatePgError(err);
      if (mapped) throw mapped;
      throw err;
    }
  });

  app.patch('/:id', { preHandler: requireRole('accountadmin') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateProjectSchema, req.body);

    const result = await withTenantTransaction(orgId, async (client) => {
      const existing = await client.query(`SELECT * FROM projects WHERE project_id = $1 AND org_id = $2`, [id, orgId]);
      if (existing.rows.length === 0) throw Errors.notFound('Project not found');

      const colMap: Record<string, string> = {
        name: 'project_name',
        location: 'location',
        city: 'city',
        description: 'description',
        reraNumber: 'rera_number',
        totalUnits: 'total_units',
        pricePerSqft: 'price_per_sqft',
        possessionDate: 'possession_date',
        isActive: 'is_active'
      };
      const sets: string[] = [];
      const params: any[] = [];
      for (const [key, col] of Object.entries(colMap)) {
        if ((body as any)[key] !== undefined) {
          params.push((body as any)[key]);
          sets.push(`${col} = $${params.length}`);
        }
      }
      if (body.type !== undefined) {
        const typeId = body.type
          ? (await client.query(`SELECT type_id FROM ref_project_types WHERE type_name = $1`, [body.type])).rows[0]
              ?.type_id ?? null
          : null;
        params.push(typeId);
        sets.push(`type_id = $${params.length}`);
      }
      if (body.status !== undefined) {
        const statusId = body.status
          ? (await client.query(`SELECT status_id FROM ref_project_statuses WHERE status_name = $1`, [body.status]))
              .rows[0]?.status_id ?? null
          : null;
        params.push(statusId);
        sets.push(`status_id = $${params.length}`);
      }
      if (sets.length > 0) {
        params.push(id, orgId);
        await client.query(
          `UPDATE projects SET ${sets.join(', ')} WHERE project_id = $${params.length - 1} AND org_id = $${params.length}`,
          params
        );
      }

      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'UPDATE',
        tableName: 'projects',
        recordId: id,
        oldValues: existing.rows[0],
        newValues: body,
        ipAddress: req.ip
      });

      const res = await client.query(
        `${PROJECT_WITH_COUNTS_SELECT} WHERE p.project_id = $1 AND p.org_id = $2 GROUP BY p.project_id, pt.type_name, ps.status_name`,
        [id, orgId]
      );
      return mapProjectRow(res.rows[0]);
    });

    return { data: result };
  });

  // frontend/src/api/types.ts Unit: id, projectId, code, status, floor, tower, price,
  // allocatedLeadId — not unit_id/unit_no/status_name/lead_id.
  function mapUnitRow(row: any) {
    return {
      id: row.unit_id,
      projectId: row.project_id,
      code: row.unit_no,
      status: row.status_name,
      floor: row.floor,
      tower: row.tower,
      price: row.price ?? null,
      allocatedLeadId: row.lead_id,
      leadName: row.lead_name,
      allocationDate: row.allocation_date
    };
  }

  app.get('/:id/units', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId } = requireTenant(req);
    const projectId = parseInt((req.params as any).id, 10);
    const status = (req.query as any)?.status as string | undefined;

    return withTenantTransaction(orgId, async (client) => {
      const params: any[] = [orgId, projectId];
      let statusFilter = '';
      if (status) {
        params.push(status);
        statusFilter = ` AND rus.status_name = $${params.length}`;
      }
      const res = await client.query(
        `SELECT pu.*, rus.status_name, l.full_name AS lead_name
         FROM project_units pu
         JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
         LEFT JOIN leads l ON l.lead_id = pu.lead_id
         WHERE pu.org_id = $1 AND pu.project_id = $2${statusFilter}
         ORDER BY pu.unit_no`,
        params
      );
      return { data: res.rows.map(mapUnitRow) };
    });
  });

  app.post('/:id/units', { preHandler: requireRole('accountadmin') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const projectId = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(addUnitsSchema, req.body);

    try {
      const result = await withTenantTransaction(orgId, async (client) => {
        const projRes = await client.query(`SELECT project_id FROM projects WHERE project_id = $1 AND org_id = $2`, [
          projectId,
          orgId
        ]);
        if (projRes.rows.length === 0) throw Errors.notFound('Project not found');

        const units = generateUnitNumbers(toInventoryRequest(body));
        const existing = await client.query(
          `SELECT unit_no FROM project_units WHERE org_id = $1 AND project_id = $2 AND unit_no = ANY($3::text[])`,
          [orgId, projectId, units.map((u) => u.unitNo)]
        );
        if (existing.rows.length > 0) {
          throw Errors.unitNotAvailable(
            `Unit number(s) already exist: ${existing.rows.map((r: any) => r.unit_no).join(', ')}`
          );
        }

        const createdIds: number[] = [];
        for (const u of units) {
          const ins = await client.query(
            `INSERT INTO project_units (org_id, project_id, unit_no, tower, floor, status_id)
             VALUES ($1,$2,$3,$4,$5,(SELECT status_id FROM ref_unit_statuses WHERE status_name='available'))
             RETURNING unit_id`,
            [orgId, projectId, u.unitNo, u.tower, u.floor]
          );
          createdIds.push(ins.rows[0].unit_id);
        }

        await writeAuditLog(client, {
          orgId,
          userId: actorId,
          action: 'CREATE',
          tableName: 'project_units',
          recordId: projectId,
          newValues: { unitsAdded: units.length },
          ipAddress: req.ip
        });

        const createdRes = await client.query(
          `SELECT pu.*, rus.status_name, NULL::text AS lead_name
           FROM project_units pu JOIN ref_unit_statuses rus ON rus.status_id = pu.status_id
           WHERE pu.unit_id = ANY($1::int[]) ORDER BY pu.unit_no`,
          [createdIds]
        );
        return createdRes.rows.map(mapUnitRow);
      });
      // frontend/src/api/projects.ts addUnits() expects Unit[] back.
      return { data: result };
    } catch (err) {
      const mapped = translatePgError(err);
      if (mapped) throw mapped;
      throw err;
    }
  });
}
