import { Pool, PoolClient } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  host: env.pg.host,
  port: env.pg.port,
  user: env.pg.user,
  password: env.pg.password,
  database: env.pg.database,
  max: 10,
  idleTimeoutMillis: 30000
});

async function setSessionDefaults(client: PoolClient) {
  await client.query(`SET search_path TO ${env.pg.schema}, public`);
}

/**
 * Runs `fn` inside a transaction with RLS tenant scoping:
 *   SET LOCAL lms.current_org_id = '<orgId>'
 *   SET LOCAL lms.encryption_key = '<key>'  (for vw_leads_full / fn_decrypt_lead_pii reads)
 * Application code MUST still filter explicitly by org_id - RLS is defense-in-depth only.
 */
export async function withTenantTransaction<T>(
  orgId: number,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await setSessionDefaults(client);
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['lms.current_org_id', String(orgId)]);
    await client.query('SELECT set_config($1, $2, true)', ['lms.encryption_key', env.piiEncKey]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` inside a plain transaction with NO tenant GUC set - for public/pre-auth
 * endpoints (org resolution, login, onboarding) and cross-tenant platform-admin routes
 * that intentionally bypass per-request tenant scoping by design.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await setSessionDefaults(client);
    await client.query('SELECT set_config($1, $2, true)', ['lms.encryption_key', env.piiEncKey]);
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    client.release();
  }
}
