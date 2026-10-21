import { FastifyInstance } from 'fastify';
import { withTransaction } from '../../db/pool';
import { authenticate, issueImpersonationToken, requireRole } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { Errors } from '../../utils/errors';
import { listEnvelope, parsePagination } from '../../utils/pagination';
import { writeAuditLog } from '../../services/audit';
import { updateTenantSchema } from './schemas';

// frontend/src/api/types.ts Org: id, name, slug, industry, country, timezone, subscriptionPlan,
// status, usersMax, usersCount, createdAt — vw_tenant_health exposes org_id/org_name/org_slug/
// max_users/active_users/tenant_since instead, and has no single `status` field (it's derived
// from onboarding_complete + is_active + subscription_status).
function mapTenantRow(row: any) {
  let status: string;
  if (!row.onboarding_complete) status = 'pending';
  else if (!row.is_active || ['suspended', 'cancelled'].includes(row.subscription_status)) status = 'suspended';
  else status = 'active';
  return {
    id: row.org_id,
    name: row.org_name,
    slug: row.org_slug,
    subscriptionPlan: row.subscription_plan,
    status,
    usersMax: row.max_users,
    usersCount: row.active_users !== undefined ? Number(row.active_users) : undefined,
    activeProjects: row.active_projects !== undefined ? Number(row.active_projects) : undefined,
    totalLeads: row.total_leads !== undefined ? Number(row.total_leads) : undefined,
    createdAt: row.tenant_since
  };
}

export default async function platformRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('platformadmin'));

  app.get('/tenants', async (req) => {
    const q = req.query as any;
    const { page, pageSize, offset } = parsePagination(q);
    return withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM vw_tenant_health ORDER BY tenant_since DESC`);
      let rows = res.rows.map(mapTenantRow);
      if (q.search) {
        const needle = String(q.search).toLowerCase();
        rows = rows.filter((r) => r.name.toLowerCase().includes(needle) || r.slug.toLowerCase().includes(needle));
      }
      if (q.status) {
        rows = rows.filter((r) => r.status === q.status);
      }
      const total = rows.length;
      return listEnvelope(rows.slice(offset, offset + pageSize), page, pageSize, total);
    });
  });

  app.patch('/tenants/:orgId', async (req) => {
    const orgId = parseInt((req.params as any).orgId, 10);
    const body = parseOrThrow(updateTenantSchema, req.body);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(`SELECT * FROM organizations WHERE org_id = $1`, [orgId]);
      if (existing.rows.length === 0) throw Errors.notFound('Tenant not found');

      const colMap: Record<string, string> = {
        subscriptionPlan: 'subscription_plan',
        subscriptionStatus: 'subscription_status',
        trialEndsAt: 'trial_ends_at',
        subscriptionEndsAt: 'subscription_ends_at',
        maxUsers: 'max_users',
        maxProjects: 'max_projects',
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
      if (body.usersMax !== undefined) {
        params.push(body.usersMax);
        sets.push(`max_users = $${params.length}`);
      }
      if (body.status !== undefined) {
        params.push(body.status !== 'suspended');
        sets.push(`is_active = $${params.length}`);
        params.push(body.status === 'suspended' ? 'suspended' : 'active');
        sets.push(`subscription_status = $${params.length}`);
      }
      if (sets.length > 0) {
        params.push(orgId);
        await client.query(`UPDATE organizations SET ${sets.join(', ')} WHERE org_id = $${params.length}`, params);
      }

      const becameInactive = body.isActive === false || body.subscriptionStatus === 'suspended' || body.status === 'suspended';
      if (becameInactive) {
        await client.query(`UPDATE user_sessions SET is_active = FALSE WHERE org_id = $1`, [orgId]);
      }

      await writeAuditLog(client, {
        orgId,
        userId: null,
        action: 'UPDATE',
        tableName: 'organizations',
        recordId: orgId,
        oldValues: existing.rows[0],
        newValues: body,
        ipAddress: req.ip
      });

      const res = await client.query(`SELECT * FROM vw_tenant_health WHERE org_id = $1`, [orgId]);
      return mapTenantRow(res.rows[0]);
    });
    return { data: result };
  });

  app.get('/tenants/:orgId/onboarding-status', async (req) => {
    const orgId = parseInt((req.params as any).orgId, 10);
    return withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM vw_onboarding_status WHERE org_id = $1`, [orgId]);
      if (res.rows.length === 0) throw Errors.notFound('Tenant not found');
      return { data: res.rows[0] };
    });
  });

  app.post('/tenants/:orgId/impersonate', async (req) => {
    const orgId = parseInt((req.params as any).orgId, 10);
    const result = await withTransaction(async (client) => {
      const res = await client.query(
        `SELECT u.user_id FROM users u JOIN ref_roles r ON r.role_id = u.role_id
         WHERE u.org_id = $1 AND r.role_name = 'accountadmin' AND u.is_active = TRUE
         ORDER BY u.user_id LIMIT 1`,
        [orgId]
      );
      if (res.rows.length === 0) throw Errors.notFound('No active accountadmin found for this tenant');
      const token = issueImpersonationToken(res.rows[0].user_id, orgId);

      await writeAuditLog(client, {
        orgId,
        userId: null,
        action: 'LOGIN',
        tableName: 'users',
        recordId: res.rows[0].user_id,
        newValues: { via: 'platform-admin-impersonate-issue' },
        ipAddress: req.ip
      });

      return { impersonationToken: token, expiresIn: 300 };
    });
    return { data: result };
  });
}
