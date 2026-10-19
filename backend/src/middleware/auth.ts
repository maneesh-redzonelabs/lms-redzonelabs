import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Errors } from '../utils/errors';
import { randomToken } from '../utils/tokens';

export interface AccessTokenClaims {
  sub: number;
  org_id: number | null;
  role: string;
  view_scope: string | null;
  user_type: string | null;
  jti: string;
  type: 'access';
}

export interface AuthedUser {
  userId: number;
  orgId: number | null;
  role: string;
  viewScope: string | null;
  userType: string | null;
  sessionId: string;
  isPlatformAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthedUser;
  }
}

export function signAccessToken(claims: Omit<AccessTokenClaims, 'type'>): string {
  return jwt.sign({ ...claims, type: 'access' }, env.jwtSecret, {
    expiresIn: `${env.accessTokenTtlMin}m`
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.jwtSecret) as unknown as AccessTokenClaims;
  if (decoded.type !== 'access') throw new Error('not an access token');
  return decoded;
}

export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.tokenExpired();
  }
  const token = header.slice('Bearer '.length);
  let claims: AccessTokenClaims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    throw Errors.tokenExpired();
  }
  req.authUser = {
    userId: claims.sub,
    orgId: claims.org_id,
    role: claims.role,
    viewScope: claims.view_scope,
    userType: claims.user_type,
    sessionId: claims.jti,
    isPlatformAdmin: claims.role === 'platformadmin'
  };
}

export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      throw Errors.forbiddenRole();
    }
  };
}

export function requireTenant(req: FastifyRequest): { orgId: number; userId: number; role: string; viewScope: string | null } {
  // Platform Admin now has a real org_id (its own "RedZone Labs" home organization) so it can be
  // issued a normal session/JWT, but it must never be treated as a tenant member of that org -
  // tenant-scoped routes stay off-limits unless accessed via impersonation (see /platform/tenants).
  if (!req.authUser || req.authUser.orgId === null || req.authUser.isPlatformAdmin) {
    throw Errors.forbiddenRole('This action requires a tenant-scoped account');
  }
  return {
    orgId: req.authUser.orgId,
    userId: req.authUser.userId,
    role: req.authUser.role,
    viewScope: req.authUser.viewScope
  };
}

// ---- Step-up tokens ----
// Short-lived (5 min), single-use JWTs issued by POST /auth/step-up after re-verifying the
// caller's password. Consumption is tracked in-memory via jti (acceptable for single-instance
// local dev; resets on restart).
const usedStepUpJti = new Set<string>();

interface StepUpClaims {
  sub: number;
  org_id: number;
  jti: string;
  type: 'stepup';
}

export function issueStepUpToken(userId: number, orgId: number): string {
  const jti = randomToken(16);
  return jwt.sign({ sub: userId, org_id: orgId, jti, type: 'stepup' } as StepUpClaims, env.jwtSecret, {
    expiresIn: '5m'
  });
}

export function verifyStepUpToken(token: string, userId: number, orgId: number): void {
  let claims: StepUpClaims;
  try {
    claims = jwt.verify(token, env.jwtSecret) as unknown as StepUpClaims;
  } catch {
    throw Errors.stepUpRequired();
  }
  if (claims.type !== 'stepup' || claims.sub !== userId || claims.org_id !== orgId) {
    throw Errors.stepUpRequired();
  }
  if (usedStepUpJti.has(claims.jti)) {
    throw Errors.stepUpRequired();
  }
  usedStepUpJti.add(claims.jti);
}

export function requireStepUp(req: FastifyRequest): void {
  const header = req.headers['x-step-up-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || !req.authUser) throw Errors.stepUpRequired();
  verifyStepUpToken(token, req.authUser.userId, req.authUser.orgId ?? -1);
}

setInterval(() => {
  if (usedStepUpJti.size > 10000) usedStepUpJti.clear();
}, 30 * 60 * 1000).unref();

// ---- Platform-admin impersonation tokens ----
// Short-lived (5 min), single-use JWTs issued by POST /platform/tenants/{orgId}/impersonate,
// exchanged by the frontend via POST /auth/exchange-impersonation for a normal user session.
const usedImpersonationJti = new Set<string>();

interface ImpersonationClaims {
  sub: number;
  org_id: number;
  jti: string;
  type: 'impersonate';
}

export function issueImpersonationToken(userId: number, orgId: number): string {
  const jti = randomToken(16);
  return jwt.sign({ sub: userId, org_id: orgId, jti, type: 'impersonate' } as ImpersonationClaims, env.jwtSecret, {
    expiresIn: '5m'
  });
}

export function verifyImpersonationToken(token: string): { userId: number; orgId: number } {
  let claims: ImpersonationClaims;
  try {
    claims = jwt.verify(token, env.jwtSecret) as unknown as ImpersonationClaims;
  } catch {
    throw Errors.tokenExpired();
  }
  if (claims.type !== 'impersonate') throw Errors.tokenExpired();
  if (usedImpersonationJti.has(claims.jti)) throw Errors.tokenExpired();
  usedImpersonationJti.add(claims.jti);
  return { userId: claims.sub, orgId: claims.org_id };
}
