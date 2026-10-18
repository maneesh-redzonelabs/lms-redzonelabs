import { FastifyInstance } from 'fastify';
import { withTenantTransaction } from '../../db/pool';
import { authenticate, requireRole, requireStepUp, requireTenant } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { Errors, translatePgError } from '../../utils/errors';
import { parsePagination, listEnvelope, parseSort } from '../../utils/pagination';
import { writeAuditLog } from '../../services/audit';
import { getVisibleLeadIds } from '../../services/leadVisibility';
import { activitySchema, createLeadSchema, listLeadsQuerySchema, updateLeadSchema } from './schemas';
import registerSiteVisitRoutes from './siteVisits';
import registerBulkImportRoutes from './bulkImport';

const SORT_WHITELIST: Record<string, string> = {
  createdAt: 'created_at',
  leadScore: 'lead_score',
  fullName: 'full_name',
  updatedAt: 'updated_at'
};

const LEAD_SOURCE_VALUES = ['walk-in', 'online', 'referral', 'expo', 'cold-call', 'social-media'];

// The frontend's "Source" field is a free-text input, but the DB column has a CHECK
// constraint restricting it to a fixed vocabulary. Normalize best-effort instead of
// hard-failing the whole lead create/update on a value the UI happily let the user type.
function normalizeLeadSource(value: string | null | undefined): string | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  return LEAD_SOURCE_VALUES.includes(lower) ? lower : null;
}

async function getLeadStatus(client: any, statusName: string) {
  const res = await client.query(`SELECT status_id, status_name, is_terminal FROM ref_lead_statuses WHERE status_name = $1`, [
    statusName
  ]);
  return res.rows[0] ?? null;
}

async function getLeadStatusById(client: any, statusId: number) {
  const res = await client.query(`SELECT status_id, status_name, is_terminal FROM ref_lead_statuses WHERE status_id = $1`, [
    statusId
  ]);
  return res.rows[0] ?? null;
}

async function getBudgetIdByLabel(client: any, label: string | null | undefined): Promise<number | null> {
  if (!label) return null;
  const res = await client.query(`SELECT budget_id FROM ref_budget_ranges WHERE label = $1`, [label]);
  return res.rows[0]?.budget_id ?? null;
}

async function getTimelineIdByLabel(client: any, label: string | null | undefined): Promise<number | null> {
  if (!label) return null;
  const res = await client.query(`SELECT timeline_id FROM ref_timelines WHERE label = $1`, [label]);
  return res.rows[0]?.timeline_id ?? null;
}

// Maps a raw `vw_leads_full` row (snake_case DB/view columns) onto the shape the frontend
// actually reads (frontend/src/api/types.ts Lead: id, name, mobile, email, status, projectId,
// projectName, ownerId, ownerName, budgetRange, timeline, source, remarks, createdAt,
// updatedAt). Extra denormalized fields are kept alongside additively in case the UI wants them.
function mapLeadRow(row: any) {
  if (!row) return row;
  return {
    id: row.lead_id,
    name: row.full_name,
    mobile: row.mobile,
    email: row.email,
    status: row.lead_status,
    projectId: row.project_id,
    projectName: row.project_name,
    ownerId: row.assigned_to_id,
    ownerName: row.assigned_to_name,
    budgetRange: row.budget_label,
    timeline: row.timeline_label,
    source: row.lead_source,
    remarks: row.remarks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    followupDate: row.followup_date,
    siteVisitDate: row.site_visit_date,
    leadScore: row.lead_score,
    statusColour: row.status_colour,
    isTerminal: row.is_terminal,
    createdByName: row.created_by_name
  };
}

export default async function leadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/leads', async (req) => {
    const { orgId, userId } = requireTenant(req);
    const q = parseOrThrow(listLeadsQuerySchema, req.query);
    const { page, pageSize, offset } = parsePagination(req.query);
    const order = parseSort(q.sort, SORT_WHITELIST, 'created_at DESC');

    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);
      if (visible.length === 0) return listEnvelope([], page, pageSize, 0);

      const conditions = ['org_id = $1', 'lead_id = ANY($2::int[])'];
      const params: any[] = [orgId, visible];
      if (q.status) {
        params.push(q.status);
        conditions.push(`lead_status = $${params.length}`);
      }
      if (q.projectId) {
        params.push(parseInt(q.projectId, 10));
        conditions.push(`project_id = $${params.length}`);
      }
      if (q.search) {
        params.push(`%${q.search}%`);
        conditions.push(`full_name ILIKE $${params.length}`);
      }
      const where = conditions.join(' AND ');

      const countRes = await client.query(`SELECT COUNT(*) FROM vw_leads_full WHERE ${where}`, params);
      params.push(pageSize, offset);
      const rows = await client.query(
        `SELECT * FROM vw_leads_full WHERE ${where} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return listEnvelope(rows.rows.map(mapLeadRow), page, pageSize, parseInt(countRes.rows[0].count, 10));
    });
  });

  app.post('/leads', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const body = parseOrThrow(createLeadSchema, req.body);

    try {
      const result = await withTenantTransaction(orgId, async (client) => {
        const statusName = body.status ?? 'New';
        const status = await getLeadStatus(client, statusName);
        if (!status) throw Errors.validation({ status: `Unknown lead status '${statusName}'` });

        const dupCheck = await client.query(
          `SELECT 1 FROM leads WHERE org_id = $1 AND mobile_hash = encode(digest($2,'sha256'),'hex') AND is_deleted = FALSE`,
          [orgId, body.mobile]
        );
        if (dupCheck.rows.length > 0) throw Errors.duplicateMobile();

        const budgetId = await getBudgetIdByLabel(client, body.budgetRange || null);
        const timelineId = await getTimelineIdByLabel(client, body.timeline || null);

        const insertRes = await client.query(
          `INSERT INTO leads (org_id, full_name, mobile, email, mobile_hash, project_id, budget_id, timeline_id,
             status_id, assigned_to, followup_date, site_visit_date, remarks, lead_source, lead_score, created_by)
           VALUES ($1,$2,
             fn_encrypt_lead_pii($3, current_setting('lms.encryption_key', true)),
             fn_encrypt_lead_pii($4, current_setting('lms.encryption_key', true)),
             encode(digest($3,'sha256'),'hex'),
             $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING lead_id`,
          [
            orgId,
            body.name,
            body.mobile,
            body.email || null,
            body.projectId ?? null,
            budgetId,
            timelineId,
            status.status_id,
            body.ownerId ?? null,
            body.followupDate ?? null,
            body.siteVisitDate ?? null,
            body.remarks ?? null,
            normalizeLeadSource(body.source),
            body.leadScore ?? 5,
            actorId
          ]
        );
        const leadId = insertRes.rows[0].lead_id;

        await writeAuditLog(client, {
          orgId,
          userId: actorId,
          action: 'CREATE',
          tableName: 'leads',
          recordId: leadId,
          newValues: { full_name: body.name, status: statusName },
          ipAddress: req.ip
        });

        const full = await client.query(`SELECT * FROM vw_leads_full WHERE lead_id = $1 AND org_id = $2`, [leadId, orgId]);
        return mapLeadRow(full.rows[0]);
      });
      return { data: result };
    } catch (err) {
      const mapped = translatePgError(err);
      if (mapped) throw mapped;
      throw err;
    }
  });

  app.get('/leads/:id', async (req) => {
    const { orgId, userId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);

    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);
      if (!visible.includes(id)) throw Errors.notFound('Lead not found');
      const res = await client.query(`SELECT * FROM vw_leads_full WHERE lead_id = $1 AND org_id = $2`, [id, orgId]);
      if (res.rows.length === 0) throw Errors.notFound('Lead not found');
      return { data: mapLeadRow(res.rows[0]) };
    });
  });

  app.patch('/leads/:id', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateLeadSchema, req.body);

    try {
      const result = await withTenantTransaction(orgId, async (client) => {
        const visible = await getVisibleLeadIds(client, orgId, actorId);
        if (!visible.includes(id)) throw Errors.notFound('Lead not found');

        const leadRes = await client.query(
          `SELECT l.*, rs.status_name AS current_status_name, rs.is_terminal AS current_is_terminal
           FROM leads l JOIN ref_lead_statuses rs ON rs.status_id = l.status_id
           WHERE l.lead_id = $1 AND l.org_id = $2 AND l.is_deleted = FALSE`,
          [id, orgId]
        );
        if (leadRes.rows.length === 0) throw Errors.notFound('Lead not found');
        const lead = leadRes.rows[0];

        let nextStatus = { status_id: lead.status_id, status_name: lead.current_status_name, is_terminal: lead.current_is_terminal };
        if (body.status) {
          const s = await getLeadStatus(client, body.status);
          if (!s) throw Errors.validation({ status: `Unknown lead status '${body.status}'` });
          nextStatus = s;
        }

        const statusChanging = nextStatus.status_id !== lead.status_id;

        if (lead.current_is_terminal && statusChanging && !body.confirm) {
          throw Errors.terminalStatusTransition(
            `Lead is in terminal status '${lead.current_status_name}'; pass {confirm:true} to transition out of it`
          );
        }

        if (lead.current_status_name === 'Won') {
          requireStepUp(req);
        }

        if (lead.current_status_name === 'Won' && statusChanging && nextStatus.status_name !== 'Won') {
          if (!body.remarks || body.remarks.trim().length === 0) {
            throw Errors.validation({ remarks: 'remarks is required when changing a lead out of Won status' });
          }
        }

        if (body.siteVisitDate) {
          if (nextStatus.status_name !== 'Site Visit Scheduled') {
            throw Errors.validation({
              siteVisitDate: "siteVisitDate can only be set when status is 'Site Visit Scheduled'"
            });
          }
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const visitDate = new Date(body.siteVisitDate);
          if (visitDate < today) {
            throw Errors.validation({ siteVisitDate: 'siteVisitDate must be today or a future date' });
          }
        }

        const colMap: Record<string, string> = {
          name: 'full_name',
          projectId: 'project_id',
          ownerId: 'assigned_to',
          followupDate: 'followup_date',
          siteVisitDate: 'site_visit_date',
          remarks: 'remarks',
          leadScore: 'lead_score'
        };
        const sets: string[] = [];
        const params: any[] = [];
        for (const [key, col] of Object.entries(colMap)) {
          if ((body as any)[key] !== undefined) {
            params.push((body as any)[key]);
            sets.push(`${col} = $${params.length}`);
          }
        }
        if (body.budgetRange !== undefined) {
          params.push(await getBudgetIdByLabel(client, body.budgetRange));
          sets.push(`budget_id = $${params.length}`);
        }
        if (body.timeline !== undefined) {
          params.push(await getTimelineIdByLabel(client, body.timeline));
          sets.push(`timeline_id = $${params.length}`);
        }
        if (body.source !== undefined) {
          params.push(normalizeLeadSource(body.source));
          sets.push(`lead_source = $${params.length}`);
        }
        if (body.email !== undefined) {
          params.push(body.email);
          sets.push(`email = fn_encrypt_lead_pii($${params.length}, current_setting('lms.encryption_key', true))`);
        }
        if (body.status) {
          params.push(nextStatus.status_id);
          sets.push(`status_id = $${params.length}`);
        }

        if (sets.length > 0) {
          params.push(id, orgId);
          await client.query(
            `UPDATE leads SET ${sets.join(', ')} WHERE lead_id = $${params.length - 1} AND org_id = $${params.length}`,
            params
          );
        }

        await writeAuditLog(client, {
          orgId,
          userId: actorId,
          action: 'UPDATE',
          tableName: 'leads',
          recordId: id,
          oldValues: { status: lead.current_status_name },
          newValues: { ...body },
          ipAddress: req.ip
        });

        const full = await client.query(`SELECT * FROM vw_leads_full WHERE lead_id = $1 AND org_id = $2`, [id, orgId]);
        return mapLeadRow(full.rows[0]);
      });
      return { data: result };
    } catch (err) {
      const mapped = translatePgError(err);
      if (mapped) throw mapped;
      throw err;
    }
  });

  app.delete('/leads/:id', { preHandler: requireRole('accountadmin', 'owner') }, async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);

    await withTenantTransaction(orgId, async (client) => {
      const res = await client.query(`SELECT lead_id FROM leads WHERE lead_id = $1 AND org_id = $2 AND is_deleted = FALSE`, [
        id,
        orgId
      ]);
      if (res.rows.length === 0) throw Errors.notFound('Lead not found');
      await client.query(`UPDATE leads SET is_deleted = TRUE WHERE lead_id = $1 AND org_id = $2`, [id, orgId]);
      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'DELETE',
        tableName: 'leads',
        recordId: id,
        ipAddress: req.ip
      });
    });
    return { data: { leadId: id, deleted: true } };
  });

  app.get('/leads/:id/history', async (req) => {
    const { orgId, userId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);
      if (!visible.includes(id)) throw Errors.notFound('Lead not found');
      const res = await client.query(
        `SELECT h.history_id, h.changed_at, h.remarks,
                os.status_name AS old_status, ns.status_name AS new_status,
                u.full_name AS changed_by_name
         FROM lead_status_history h
         LEFT JOIN ref_lead_statuses os ON os.status_id = h.old_status_id
         JOIN ref_lead_statuses ns ON ns.status_id = h.new_status_id
         JOIN users u ON u.user_id = h.changed_by
         WHERE h.lead_id = $1 AND h.org_id = $2
         ORDER BY h.changed_at`,
        [id, orgId]
      );
      // frontend/src/api/types.ts LeadHistoryEntry: id, leadId, field, oldValue, newValue,
      // changedAt, changedBy, remarks. This history table only tracks status transitions.
      return {
        data: res.rows.map((r: any) => ({
          id: r.history_id,
          leadId: id,
          field: 'status',
          oldValue: r.old_status,
          newValue: r.new_status,
          changedAt: r.changed_at,
          changedBy: r.changed_by_name,
          remarks: r.remarks
        }))
      };
    });
  });

  app.get('/leads/:id/activities', async (req) => {
    const { orgId, userId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    return withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, userId);
      if (!visible.includes(id)) throw Errors.notFound('Lead not found');
      const res = await client.query(
        `SELECT la.*, u.full_name AS created_by_name
         FROM lead_activities la JOIN users u ON u.user_id = la.created_by
         WHERE la.lead_id = $1 AND la.org_id = $2 ORDER BY la.activity_date DESC`,
        [id, orgId]
      );
      // frontend/src/api/types.ts LeadActivity: id, leadId, type, note, createdAt, createdBy.
      return {
        data: res.rows.map((r: any) => ({
          id: r.activity_id,
          leadId: r.lead_id,
          type: r.activity_type,
          note: r.description || r.subject,
          createdAt: r.activity_date,
          createdBy: r.created_by_name
        }))
      };
    });
  });

  app.post('/leads/:id/activities', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(activitySchema, req.body);

    const result = await withTenantTransaction(orgId, async (client) => {
      const visible = await getVisibleLeadIds(client, orgId, actorId);
      if (!visible.includes(id)) throw Errors.notFound('Lead not found');

      const res = await client.query(
        `INSERT INTO lead_activities (org_id, lead_id, activity_type, subject, description, activity_date, duration_mins, outcome, next_action, next_action_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          orgId,
          id,
          body.activityType,
          body.subject ?? null,
          body.description ?? null,
          body.activityDate,
          body.durationMins ?? null,
          body.outcome ?? null,
          body.nextAction ?? null,
          body.nextActionDate ?? null,
          actorId
        ]
      );

      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'CREATE',
        tableName: 'lead_activities',
        recordId: res.rows[0].activity_id,
        newValues: { activityType: body.activityType },
        ipAddress: req.ip
      });

      return res.rows[0];
    });
    return { data: result };
  });

  registerSiteVisitRoutes(app);
  registerBulkImportRoutes(app);
}

export { getLeadStatus, getLeadStatusById };
