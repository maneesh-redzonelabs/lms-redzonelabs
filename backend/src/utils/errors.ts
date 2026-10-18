export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  validation: (details?: unknown) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid mobile or password'),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', 'Access token expired or invalid'),
  stepUpRequired: () => new AppError(401, 'STEP_UP_REQUIRED', 'A valid step-up token is required for this action'),
  trialExpired: () => new AppError(402, 'TRIAL_EXPIRED', 'Organization trial period has expired'),
  forbiddenRole: (msg = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN_ROLE', msg),
  tenantSuspended: () => new AppError(403, 'TENANT_SUSPENDED', 'Organization is suspended or inactive'),
  notFound: (msg = 'Resource not found') => new AppError(404, 'NOT_FOUND', msg),
  duplicateMobile: (msg = 'A record with this mobile number already exists') =>
    new AppError(409, 'DUPLICATE_MOBILE', msg),
  unitNotAvailable: (msg = 'Unit is not available') => new AppError(409, 'UNIT_NOT_AVAILABLE', msg),
  planLimitExceeded: (msg = 'Plan limit exceeded') => new AppError(409, 'PLAN_LIMIT_EXCEEDED', msg),
  terminalStatusTransition: (msg = 'Confirmation required to transition out of a terminal status') =>
    new AppError(422, 'TERMINAL_STATUS_TRANSITION', msg),
  tooManyAttempts: (msg = 'Too many attempts, please try again later') =>
    new AppError(429, 'TOO_MANY_ATTEMPTS', msg),
  rateLimited: (msg = 'Rate limit exceeded') => new AppError(429, 'RATE_LIMITED', msg),
  internal: (msg = 'Internal server error') => new AppError(500, 'INTERNAL_ERROR', msg)
};

export function translatePgError(err: any): AppError | null {
  const msg: string = err?.message ?? '';
  if (err?.code === '23505') {
    // unique_violation
    if (/uq_users_org_mobile/.test(msg) || /mobile/.test(msg)) {
      return Errors.duplicateMobile();
    }
    if (/idx_leads_org_mobile_hash/.test(msg)) {
      return Errors.duplicateMobile();
    }
    if (/uq_pu_project_unit/.test(msg)) {
      return new AppError(409, 'UNIT_NOT_AVAILABLE', 'Unit number already exists in this project');
    }
    return new AppError(409, 'DUPLICATE_ENTRY', 'Duplicate entry');
  }
  if (msg.includes('PLAN_LIMIT_EXCEEDED')) {
    return Errors.planLimitExceeded(msg.replace(/^.*PLAN_LIMIT_EXCEEDED:\s*/, ''));
  }
  return null;
}
