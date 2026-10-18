import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { withTenantTransaction } from '../../db/pool';
import { authenticate, requireRole, requireTenant } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { Errors, translatePgError } from '../../utils/errors';
import { parsePagination, listEnvelope } from '../../utils/pagination';
import { writeAuditLog } from '../../services/audit';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from './schemas';

const USER_COLUMNS = `u.user_id, u.org_id, u.full_name, u.mobile, u.email, u.role_id, r.role_name,
  u.manager_id, u.user_type, u.company_name, u.is_active, u.created_by, u.created_at, u.updated_at, u.last_login_at`;

const REQUIRED_MANAGER_ROLE: Record<string, string | null> = {
  owner: null,
  manager: 'owner',
  member: 'manager'
};

// frontend/src/api/types.ts User: id, name, mobile, email, role, status ('active'|'inactive'|
// 'invited'), reportsTo, orgId, createdAt — not the raw full_name/role_id+role_name/manager_id/
// is_active column names the DB view/join naturally returns.
function mapUserRow(row: any) {
  if (!row) return row;
  return {
    id: row.user_id,
    orgId: row.org_id,
    name: row.full_name,
    mobile: row.mobile,
    email: row.email,
    role: row.role_name,
    status: row.is_active === false ? 'inactive' : 'active',
    reportsTo: row.manager_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userType: row.user_type,
    companyName: row.company_name,
    lastLoginAt: row.last_login_at
  };
}

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('accountadmin'));

  app.get('/', async (req) => {
    const { orgId } = requireTenant(req);
    const q = parseOrThrow(listUsersQuerySchema, req.query);
    const { page, pageSize, offset } = parsePagination(req.query);

    return withTenantTransaction(orgId, async (client) => {
      const conditions = ['u.org_id = $1'];
      const params: any[] = [orgId];
      if (q.search) {
        params.push(`%${q.search}%`);
        conditions.push(`(u.full_name ILIKE $${params.length} OR u.mobile ILIKE $${params.length})`);
      }
      if (q.status === 'active') conditions.push('u.is_active = TRUE');
      else if (q.status === 'inactive') conditions.push('u.is_active = FALSE');

      const where = conditions.join(' AND ');
      const countRes = await client.query(`SELECT COUNT(*) FROM users u WHERE ${where}`, params);
      params.push(pageSize, offset);
      const rows = await client.query(
        `SELECT ${USER_COLUMNS} FROM users u JOIN ref_roles r ON r.role_id = u.role_id
         WHERE ${where} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return listEnvelope(rows.rows.map(mapUserRow), page, pageSize, parseInt(countRes.rows[0].count, 10));
    });
  });

  app.get('/managers', async (req) => {
    const { orgId } = requireTenant(req);
    return withTenantTransaction(orgId, async (client) => {
      const res = await client.query(
        `SELECT ${USER_COLUMNS} FROM users u JOIN ref_roles r ON r.role_id = u.role_id
         WHERE u.org_id = $1 AND u.is_active = TRUE AND r.role_name IN ('owner','manager')
         ORDER BY r.role_name, u.full_name`,
        [orgId]
      );
      return { data: res.rows.map(mapUserRow) };
    });
  });

  app.get('/:id', async (req) => {
    const { orgId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    return withTenantTransaction(orgId, async (client) => {
      const res = await client.query(
        `SELECT ${USER_COLUMNS} FROM users u JOIN ref_roles r ON r.role_id = u.role_id WHERE u.user_id = $1 AND u.org_id = $2`,
        [id, orgId]
      );
      if (res.rows.length === 0) throw Errors.notFound('User not found');
      return { data: mapUserRow(res.rows[0]) };
    });
  });

  app.post('/', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const body = parseOrThrow(createUserSchema, req.body);

    try {
      const result = await withTenantTransaction(orgId, async (client) => {
        const requiredManagerRole = REQUIRED_MANAGER_ROLE[body.role];
        if (requiredManagerRole && body.reportsTo) {
          const mgrRes = await client.query(
            `SELECT r.role_name FROM users u JOIN ref_roles r ON r.role_id = u.role_id
             WHERE u.user_id = $1 AND u.org_id = $2 AND u.is_active = TRUE`,
            [body.reportsTo, orgId]
          );
          if (mgrRes.rows.length === 0 || mgrRes.rows[0].role_name !== requiredManagerRole) {
            throw Errors.validation({
              reportsTo: `A '${body.role}' must report to an active '${requiredManagerRole}'`
            });
          }
        }

        const roleRes = await client.query(`SELECT role_id FROM ref_roles WHERE role_name = $1`, [body.role]);
        const userType = body.userType ?? 'Internal';
        // The frontend's "Add user" form collects no password field at all; issue a default
        // temporary password the account admin can communicate out-of-band / the user resets.
        const passwordHash = await bcrypt.hash(body.initialPassword ?? 'Welcome@123', 12);

        const insertRes = await client.query(
          `INSERT INTO users (org_id, full_name, mobile, email, password_hash, role_id, manager_id, user_type, company_name, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10)
           RETURNING user_id, org_id, full_name, mobile, email, role_id, manager_id, user_type, company_name, is_active, created_at`,
          [
            orgId,
            body.name,
            body.mobile,
            body.email || null,
            passwordHash,
            roleRes.rows[0].role_id,
            body.role === 'owner' ? null : body.reportsTo,
            userType,
            userType === 'External' ? body.companyName ?? null : null,
            actorId
          ]
        );
        const created = insertRes.rows[0];

        await writeAuditLog(client, {
          orgId,
          userId: actorId,
          action: 'CREATE',
          tableName: 'users',
          recordId: created.user_id,
          newValues: { full_name: created.full_name, mobile: created.mobile, role: body.role },
          ipAddress: req.ip
        });

        return mapUserRow({ ...created, role_name: body.role });
      });
      return { data: result };
    } catch (err) {
      const mapped = translatePgError(err);
      if (mapped) throw mapped;
      throw err;
    }
  });

  app.patch('/:id', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const id = parseInt((req.params as any).id, 10);
    const body = parseOrThrow(updateUserSchema, req.body);

    try {
      const result = await withTenantTransaction(orgId, async (client) => {
        const existingRes = await client.query(
          `SELECT u.*, r.role_name FROM users u JOIN ref_roles r ON r.role_id = u.role_id WHERE u.user_id = $1 AND u.org_id = $2`,
          [id, orgId]
        );
        if (existingRes.rows.length === 0) throw Errors.notFound('User not found');
        const existing = existingRes.rows[0];

        const nextRole = body.role ?? existing.role_name;
        const nextManagerId = body.reportsTo !== undefined ? body.reportsTo : existing.manager_id;
        const requiredManagerRole = REQUIRED_MANAGER_ROLE[nextRole];
        if (requiredManagerRole) {
          if (!nextManagerId) throw Errors.validation({ reportsTo: 'reportsTo is required for this role' });
          const mgrRes = await client.query(
            `SELECT r.role_name FROM users u JOIN ref_roles r ON r.role_id = u.role_id
             WHERE u.user_id = $1 AND u.org_id = $2 AND u.is_active = TRUE`,
            [nextManagerId, orgId]
          );
          if (mgrRes.rows.length === 0 || mgrRes.rows[0].role_name !== requiredManagerRole) {
            throw Errors.validation({
              reportsTo: `A '${nextRole}' must report to an active '${requiredManagerRole}'`
            });
          }
        }

        // `status` ('active'|'inactive') is what the frontend sends; `isActive` is kept accepted
        // too for any direct API callers.
        const isActive = body.status !== undefined ? body.status === 'active' : body.isActive;

        const sets: string[] = [];
        const params: any[] = [];
        function set(col: string, val: any) {
          params.push(val);
          sets.push(`${col} = $${params.length}`);
        }
        if (body.name !== undefined) set('full_name', body.name);
        if (body.email !== undefined) set('email', body.email);
        if (body.userType !== undefined) set('user_type', body.userType);
        if (body.companyName !== undefined) set('company_name', body.companyName);
        if (body.role !== undefined) {
          const roleRes = await client.query(`SELECT role_id FROM ref_roles WHERE role_name = $1`, [body.role]);
          set('role_id', roleRes.rows[0].role_id);
        }
        if (body.reportsTo !== undefined) set('manager_id', nextRole === 'owner' ? null : body.reportsTo);
        if (isActive !== undefined) set('is_active', isActive);

        if (sets.length > 0) {
          params.push(id, orgId);
          await client.query(
            `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${params.length - 1} AND org_id = $${params.length}`,
            params
          );
        }

        if (isActive === false) {
          await client.query(`UPDATE user_sessions SET is_active = FALSE WHERE user_id = $1 AND org_id = $2`, [
            id,
            orgId
          ]);
        }

        await writeAuditLog(client, {
          orgId,
          userId: actorId,
          action: 'UPDATE',
          tableName: 'users',
          recordId: id,
          oldValues: { full_name: existing.full_name, is_active: existing.is_active, role: existing.role_name },
          newValues: body,
          ipAddress: req.ip
        });

        const res = await client.query(
          `SELECT ${USER_COLUMNS} FROM users u JOIN ref_roles r ON r.role_id = u.role_id WHERE u.user_id = $1 AND u.org_id = $2`,
          [id, orgId]
        );
        return mapUserRow(res.rows[0]);
      });
      return { data: result };
    } catch (err) {
      const mapped = translatePgError(err);
      if (mapped) throw mapped;
      throw err;
    }
  });
}
