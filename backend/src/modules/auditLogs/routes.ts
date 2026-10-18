import { FastifyInstance } from 'fastify';
import { withTenantTransaction, withTransaction } from '../../db/pool';
import { authenticate, requireRole } from '../../middleware/auth';
import { Errors } from '../../utils/errors';
import { listEnvelope, parsePagination } from '../../utils/pagination';
import { maskPiiInJson } from '../../utils/tokens';

export default async function auditLogRoutes(app: FastifyInstance) {
  app.get('/audit-logs', { preHandler: [authenticate, requireRole('accountadmin', 'platformadmin')] }, async (req) => {
    const user = req.authUser!;
    const { page, pageSize, offset } = parsePagination(req.query);
    const q = req.query as any;

    const conditions: string[] = [];
    const params: any[] = [];

    function addCond(col: string, val: any) {
      if (val === undefined || val === null || val === '') return;
      params.push(val);
      conditions.push(`${col} = $${params.length}`);
    }

    if (user.role === 'platformadmin') {
      addCond('org_id', q.orgId ? parseInt(q.orgId, 10) : undefined);
    } else {
      // accountadmin is restricted to their own org regardless of any orgId query param
      params.push(user.orgId);
      conditions.push(`org_id = $${params.length}`);
    }
    addCond('action', q.action);
    addCond('table_name', q.tableName);
    addCond('user_id', q.userId ? parseInt(q.userId, 10) : undefined);
    if (q.dateFrom) {
      params.push(q.dateFrom);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (q.dateTo) {
      params.push(q.dateTo);
      conditions.push(`created_at <= $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // frontend/src/api/types.ts AuditLogEntry: id, actorId, actorName, action, entity, entityId,
    // createdAt, details — not id/user_id/table_name/record_id/old_values/new_values.
    const runQuery = async (client: any) => {
      const countRes = await client.query(`SELECT COUNT(*) FROM audit_logs ${where}`, params);
      const qParams = [...params, pageSize, offset];
      const rows = await client.query(
        `SELECT al.*, u.full_name AS actor_name
         FROM audit_logs al LEFT JOIN users u ON u.user_id = al.user_id AND u.org_id = al.org_id
         ${where.replace(/\b(org_id|action|table_name|user_id|created_at)\b/g, 'al.$1')}
         ORDER BY al.created_at DESC LIMIT $${qParams.length - 1} OFFSET $${qParams.length}`,
        qParams
      );
      const mapped = rows.rows.map((r: any) => ({
        id: r.audit_id ?? r.log_id ?? r.id,
        actorId: r.user_id,
        actorName: r.actor_name,
        action: r.action,
        entity: r.table_name,
        entityId: r.record_id,
        createdAt: r.created_at,
        details: {
          oldValues: r.old_values ? maskPiiInJson(r.old_values) : null,
          newValues: r.new_values ? maskPiiInJson(r.new_values) : null
        }
      }));
      return listEnvelope(mapped, page, pageSize, parseInt(countRes.rows[0].count, 10));
    };

    if (user.role === 'platformadmin') {
      return withTransaction(runQuery);
    }
    if (user.orgId === null) throw Errors.forbiddenRole();
    return withTenantTransaction(user.orgId, runQuery);
  });
}
