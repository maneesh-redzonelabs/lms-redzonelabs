import { PoolClient } from 'pg';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'VIEW' | 'EXPORT';

export async function writeAuditLog(
  client: PoolClient,
  params: {
    orgId: number | null;
    userId: number | null;
    action: AuditAction;
    tableName?: string;
    recordId?: number | null;
    oldValues?: unknown;
    newValues?: unknown;
    ipAddress?: string | null;
    sessionId?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (org_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, session_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      params.orgId,
      params.userId,
      params.action,
      params.tableName ?? null,
      params.recordId ?? null,
      params.oldValues ? JSON.stringify(params.oldValues) : null,
      params.newValues ? JSON.stringify(params.newValues) : null,
      params.ipAddress ?? null,
      params.sessionId ?? null
    ]
  );
}
