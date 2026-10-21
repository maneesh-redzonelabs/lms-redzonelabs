import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { withTransaction } from '../../db/pool';
import { parseOrThrow } from '../../utils/validate';
import { Errors } from '../../utils/errors';
import { allow, RateLimits } from '../../middleware/rateLimit';
import { randomToken, sha256Hex } from '../../utils/tokens';
import {
  authenticate,
  issueStepUpToken,
  signAccessToken,
  verifyAccessToken,
  verifyImpersonationToken
} from '../../middleware/auth';
import { writeAuditLog } from '../../services/audit';
import { env } from '../../config/env';
import { sendOtp, verifyOtp } from '../../services/otp';
import {
  logoutSchema,
  refreshSchema,
  resolveOrgSchema,
  sendLoginOtpSchema,
  stepUpSchema,
  verifyLoginOtpSchema
} from './schemas';

async function findLoginUserByMobile(client: any, mobile: string) {
  const res = await client.query(
    `SELECT u.user_id, u.org_id, u.full_name, u.mobile, u.email, u.user_type, u.company_name,
            u.manager_id, u.is_active, u.created_at, r.role_name, r.view_scope,
            o.is_active AS org_is_active, o.subscription_status
     FROM users u
     JOIN ref_roles r ON r.role_id = u.role_id
     JOIN organizations o ON o.org_id = u.org_id
     WHERE u.mobile = $1 AND u.is_active = TRUE
     ORDER BY u.created_at ASC LIMIT 1`,
    [mobile]
  );
  return res.rows[0] ?? null;
}

// frontend/src/api/types.ts User (consumed via AuthSession.user and GET /auth/me) expects
// { id, name, mobile, email, role, status, reportsTo, orgId, createdAt } — not the raw
// userId/fullName/managerId column names.
function userProfile(row: any) {
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
    viewScope: row.view_scope,
    userType: row.user_type,
    companyName: row.company_name
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/resolve-org', async (req) => {
    const body = parseOrThrow(resolveOrgSchema, req.body);
    const org = await withTransaction(async (client) => {
      if (body.slugOrDomain) {
        const result = await client.query(`SELECT * FROM fn_get_org_by_slug($1)`, [body.slugOrDomain]);
        if (result.rows.length === 0) return null;
        const extra = await client.query(`SELECT logo_url, org_slug FROM organizations WHERE org_id = $1`, [
          result.rows[0].org_id
        ]);
        return { ...result.rows[0], ...extra.rows[0] };
      }

      // Mobile-first login (matches the prototype's flow: the user enters only their
      // registered mobile number, with no separate org/slug step). Resolve the tenant from
      // the active user row matching that mobile, falling back to the organization's own
      // primary contact mobile (covers a freshly-onboarded AccountAdmin edge case).
      const byUser = await client.query(
        `SELECT o.* FROM users u JOIN organizations o ON o.org_id = u.org_id
         WHERE u.mobile = $1 AND u.is_active = TRUE ORDER BY u.created_at ASC LIMIT 1`,
        [body.mobile]
      );
      if (byUser.rows.length > 0) return byUser.rows[0];

      const byOrgContact = await client.query(
        `SELECT * FROM organizations WHERE primary_contact_mobile = $1 AND is_active = TRUE ORDER BY created_at ASC LIMIT 1`,
        [body.mobile]
      );
      if (byOrgContact.rows.length > 0) return byOrgContact.rows[0];

      return null;
    });
    if (!org) throw Errors.notFound('This mobile number is not registered for platform access.');
    return {
      data: {
        orgId: org.org_id,
        orgName: org.org_name,
        orgSlug: org.org_slug,
        isActive: org.is_active,
        subscriptionStatus: org.subscription_status,
        trialEndsAt: org.trial_ends_at,
        onboardingComplete: org.onboarding_complete,
        timezone: org.timezone,
        logoUrl: org.logo_url
      }
    };
  });

  // Login is mobile + OTP for every role, matching the static prototype (no password anywhere).
  // /otp/send only checks that the mobile is registered so the UI can show a friendly error
  // before moving to the OTP screen; the mock OTP below doesn't need anything stored server-side.
  app.post('/otp/send', async (req) => {
    const ip = req.ip;
    if (!allow(`otp-send:${ip}`, RateLimits.LOGIN_PER_IP.windowMs, RateLimits.LOGIN_PER_IP.max)) {
      throw Errors.rateLimited('Too many OTP requests from this IP, please wait a minute');
    }
    const body = parseOrThrow(sendLoginOtpSchema, req.body);
    const user = await withTransaction((client) => findLoginUserByMobile(client, body.mobile));
    if (!user) throw Errors.notFound('This mobile number is not registered for platform access.');
    sendOtp('sms', body.mobile, 'login');
    return { data: { sent: true } };
  });

  app.post('/otp/verify', async (req) => {
    const ip = req.ip;
    if (!allow(`otp-verify:${ip}`, RateLimits.LOGIN_PER_IP.windowMs, RateLimits.LOGIN_PER_IP.max)) {
      throw Errors.rateLimited('Too many attempts from this IP, please wait a minute');
    }
    const body = parseOrThrow(verifyLoginOtpSchema, req.body);
    if (!verifyOtp(body.otp)) {
      throw Errors.validation({ otp: 'Incorrect code. Use the demo code shown above.' });
    }

    const result = await withTransaction(async (client) => {
      const u = await findLoginUserByMobile(client, body.mobile);
      if (!u) throw Errors.invalidCredentials();

      if (!u.org_is_active || ['suspended', 'cancelled'].includes(u.subscription_status)) {
        throw Errors.tenantSuspended();
      }

      await client.query(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = $1`, [u.user_id]);

      const refreshToken = randomToken();
      const sessionId = sha256Hex(refreshToken);
      const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 86400000);
      await client.query(
        `INSERT INTO user_sessions (session_id, org_id, user_id, device_type, ip_address, user_agent, expires_at, last_active_at, is_active)
         VALUES ($1,$2,$3,'desktop',$4,$5,$6,CURRENT_TIMESTAMP,TRUE)`,
        [sessionId, u.org_id, u.user_id, ip, req.headers['user-agent'] ?? null, expiresAt]
      );

      const accessToken = signAccessToken({
        sub: u.user_id,
        org_id: u.org_id,
        role: u.role_name,
        view_scope: u.view_scope,
        user_type: u.user_type,
        jti: sessionId
      });

      await writeAuditLog(client, {
        orgId: u.org_id,
        userId: u.user_id,
        action: 'LOGIN',
        tableName: 'users',
        recordId: u.user_id,
        newValues: { via: 'otp' },
        ipAddress: ip,
        sessionId
      });

      return { accessToken, refreshToken, user: userProfile(u) };
    });

    return { data: { ...result, expiresIn: env.accessTokenTtlMin * 60 } };
  });

  app.post('/refresh', async (req) => {
    const body = parseOrThrow(refreshSchema, req.body);
    const hash = sha256Hex(body.refreshToken);

    const result = await withTransaction(async (client) => {
      const sessRes = await client.query(
        `SELECT s.session_id, s.org_id, s.user_id, u.full_name, r.role_name, r.view_scope, u.user_type
         FROM user_sessions s
         JOIN users u ON u.user_id = s.user_id
         JOIN ref_roles r ON r.role_id = u.role_id
         WHERE s.session_id = $1 AND s.is_active = TRUE AND s.expires_at > CURRENT_TIMESTAMP`,
        [hash]
      );
      if (sessRes.rows.length === 0) throw Errors.tokenExpired();
      const s = sessRes.rows[0];

      const newRefresh = randomToken();
      const newHash = sha256Hex(newRefresh);
      const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 86400000);
      await client.query(
        `UPDATE user_sessions SET session_id = $1, expires_at = $2, last_active_at = CURRENT_TIMESTAMP WHERE session_id = $3`,
        [newHash, expiresAt, hash]
      );

      const accessToken = signAccessToken({
        sub: s.user_id,
        org_id: s.org_id,
        role: s.role_name,
        view_scope: s.view_scope,
        user_type: s.user_type,
        jti: newHash
      });
      return { accessToken, refreshToken: newRefresh };
    });

    return { data: { ...result, expiresIn: env.accessTokenTtlMin * 60 } };
  });

  app.post('/logout', { preHandler: authenticate }, async (req) => {
    const body = parseOrThrow(logoutSchema, req.body ?? {});
    const user = req.authUser!;

    await withTransaction(async (client) => {
      if (body.everywhere) {
        await client.query(`UPDATE user_sessions SET is_active = FALSE WHERE user_id = $1 AND org_id = $2`, [
          user.userId,
          user.orgId
        ]);
      } else {
        await client.query(`UPDATE user_sessions SET is_active = FALSE WHERE session_id = $1`, [user.sessionId]);
      }
      await writeAuditLog(client, {
        orgId: user.orgId,
        userId: user.userId,
        action: 'LOGOUT',
        tableName: 'users',
        recordId: user.userId,
        ipAddress: req.ip,
        sessionId: user.sessionId
      });
    });
    return { data: { loggedOut: true } };
  });

  app.post('/step-up', { preHandler: authenticate }, async (req) => {
    const body = parseOrThrow(stepUpSchema, req.body);
    const user = req.authUser!;
    if (user.isPlatformAdmin || user.orgId === null) throw Errors.forbiddenRole('Step-up not applicable');

    const token = await withTransaction(async (client) => {
      const res = await client.query(`SELECT password_hash FROM vw_auth_users WHERE user_id = $1 AND org_id = $2`, [
        user.userId,
        user.orgId
      ]);
      if (res.rows.length === 0) throw Errors.invalidCredentials();
      const ok = await bcrypt.compare(body.password, res.rows[0].password_hash);
      if (!ok) throw Errors.invalidCredentials();
      return issueStepUpToken(user.userId, user.orgId as number);
    });

    return { data: { stepUpToken: token, expiresIn: 300 } };
  });

  app.post('/exchange-impersonation', async (req) => {
    const body = parseOrThrow(z.object({ token: z.string().min(10) }).strict(), req.body);
    const { userId, orgId } = verifyImpersonationToken(body.token);

    const result = await withTransaction(async (client) => {
      const userRes = await client.query(
        `SELECT u.user_id, u.org_id, u.full_name, u.mobile, u.email, u.user_type, u.company_name, u.manager_id,
                u.is_active, u.created_at, r.role_name, r.view_scope
         FROM users u JOIN ref_roles r ON r.role_id = u.role_id
         WHERE u.user_id = $1 AND u.org_id = $2 AND u.is_active = TRUE`,
        [userId, orgId]
      );
      if (userRes.rows.length === 0) throw Errors.notFound('Impersonation target not found or inactive');
      const u = userRes.rows[0];

      const refreshToken = randomToken();
      const sessionId = sha256Hex(refreshToken);
      const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 86400000);
      await client.query(
        `INSERT INTO user_sessions (session_id, org_id, user_id, device_type, ip_address, user_agent, expires_at, last_active_at, is_active)
         VALUES ($1,$2,$3,'desktop',$4,$5,$6,CURRENT_TIMESTAMP,TRUE)`,
        [sessionId, orgId, u.user_id, req.ip, req.headers['user-agent'] ?? null, expiresAt]
      );

      const accessToken = signAccessToken({
        sub: u.user_id,
        org_id: orgId,
        role: u.role_name,
        view_scope: u.view_scope,
        user_type: u.user_type,
        jti: sessionId
      });

      await writeAuditLog(client, {
        orgId,
        userId: u.user_id,
        action: 'LOGIN',
        tableName: 'users',
        recordId: u.user_id,
        newValues: { via: 'platform-admin-impersonation' },
        ipAddress: req.ip,
        sessionId
      });

      return { accessToken, refreshToken, user: userProfile(u) };
    });

    return { data: { ...result, expiresIn: env.accessTokenTtlMin * 60 } };
  });

  app.get('/me', { preHandler: authenticate }, async (req) => {
    const user = req.authUser!;
    const data = await withTransaction(async (client) => {
      const res = await client.query(
        `SELECT u.user_id, u.org_id, u.full_name, u.mobile, u.email, u.user_type, u.company_name, u.manager_id,
                u.is_active, u.created_at, r.role_id, r.role_name, r.view_scope, r.can_create_users, r.can_create_projects
         FROM users u JOIN ref_roles r ON r.role_id = u.role_id
         WHERE u.user_id = $1 AND u.org_id = $2`,
        [user.userId, user.orgId]
      );
      if (res.rows.length === 0) throw Errors.notFound('User not found');
      const u = res.rows[0];
      return {
        ...userProfile(u),
        permissions: {
          canCreateUsers: u.can_create_users,
          canCreateProjects: u.can_create_projects,
          canManageAllocations: ['accountadmin', 'owner'].includes(u.role_name),
          canDeleteLeads: ['accountadmin', 'owner'].includes(u.role_name),
          isPlatformAdmin: u.role_name === 'platformadmin'
        }
      };
    });
    return { data };
  });
}

export { verifyAccessToken };
