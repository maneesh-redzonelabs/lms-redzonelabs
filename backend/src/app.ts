import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { randomUUID } from 'crypto';
import { env } from './config/env';
import { AppError } from './utils/errors';
import { allow, RateLimits } from './middleware/rateLimit';
import { deepCamelCase } from './utils/caseConvert';

import authRoutes from './modules/auth/routes';
import onboardingRoutes from './modules/onboarding/routes';
import userRoutes from './modules/users/routes';
import projectRoutes from './modules/projects/routes';
import unitRoutes from './modules/units/routes';
import leadRoutes from './modules/leads/routes';
import allocationRoutes from './modules/allocations/routes';
import dashboardRoutes from './modules/dashboard/routes';
import reportRoutes from './modules/reports/routes';
import orgRoutes from './modules/org/routes';
import refRoutes from './modules/ref/routes';
import platformRoutes from './modules/platform/routes';
import auditLogRoutes from './modules/auditLogs/routes';

const PUBLIC_PREFIXES = ['/api/v1/auth/', '/api/v1/onboarding/', '/api/v1/ref/'];

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger:
      env.nodeEnv === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : true,
    genReqId: () => randomUUID()
  });

  app.register(helmet);
  app.register(cors, {
    origin: env.corsOrigin,
    credentials: true
  });
  app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB cap for bulk-import uploads
  });

  // Generic authenticated-user rate limit (100/min/user) - login/onboarding endpoints have
  // their own stricter per-IP limiters applied inline in their route handlers.
  app.addHook('onRequest', async (req, reply) => {
    const isPublic = PUBLIC_PREFIXES.some((p) => req.url.startsWith(p));
    if (isPublic) return;
    const authHeader = req.headers.authorization;
    const key = authHeader ? `user:${authHeader}` : `ip:${req.ip}`;
    if (!allow(key, RateLimits.AUTHED_PER_USER.windowMs, RateLimits.AUTHED_PER_USER.max)) {
      reply.code(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests', details: null, requestId: req.id }
      });
    }
  });

  // Route handlers often return raw `pg` row objects (snake_case DB columns);
  // normalize every JSON response to camelCase so the API contract stays consistent
  // regardless of whether a handler hand-maps its payload or returns rows as-is.
  app.addHook('preSerialization', async (_req, _reply, payload) => deepCamelCase(payload));

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details ?? null, requestId: req.id }
      });
      return;
    }
    // fastify built-in errors (body too large, bad json, etc.)
    const statusCode = (error as any).statusCode;
    if (statusCode && statusCode < 500) {
      reply.code(statusCode).send({
        error: { code: 'VALIDATION_ERROR', message: error.message, details: null, requestId: req.id }
      });
      return;
    }
    req.log.error(error);
    reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: null, requestId: req.id }
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found', details: null, requestId: req.id }
    });
  });

  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' });
  app.register(userRoutes, { prefix: '/api/v1/users' });
  app.register(projectRoutes, { prefix: '/api/v1/projects' });
  app.register(unitRoutes, { prefix: '/api/v1/units' });
  app.register(leadRoutes, { prefix: '/api/v1' }); // includes /leads and /site-visits
  app.register(allocationRoutes, { prefix: '/api/v1/allocations' });
  app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  app.register(reportRoutes, { prefix: '/api/v1/reports' });
  app.register(orgRoutes, { prefix: '/api/v1/org' });
  app.register(refRoutes, { prefix: '/api/v1/ref' });
  app.register(platformRoutes, { prefix: '/api/v1/platform' });
  app.register(auditLogRoutes, { prefix: '/api/v1' }); // /audit-logs

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
