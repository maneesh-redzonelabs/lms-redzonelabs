import { PoolClient } from 'pg';

/** Wraps fn_visible_lead_ids(org_id, user_id) - respects role view_scope (own/team/all). */
export async function getVisibleLeadIds(client: PoolClient, orgId: number, userId: number): Promise<number[]> {
  const result = await client.query<{ lead_id: number }>(
    `SELECT lead_id FROM fn_visible_lead_ids($1, $2)`,
    [orgId, userId]
  );
  return result.rows.map((r) => r.lead_id);
}
