import { api, Paginated } from './client';
import type { Org, AuditLogEntry } from './types';

// Every backend route wraps its payload as `{ data: ... }` except paginated list endpoints
// (see api/auth.ts for the full explanation) - PATCH /platform/tenants/:orgId returns the
// updated org wrapped the same way, so unwrap it here.
interface Envelope<T> {
  data: T;
}

export type TenantsListParams = {
  search?: string;
  status?: string;
  orgStatus?: string;
  page?: number;
  pageSize?: number;
}

export function listTenants(params: TenantsListParams = {}) {
  return api.get<Paginated<Org>>('/platform/tenants', params);
}

export interface PatchTenantInput {
  orgStatus?: 'Pending' | 'Active' | 'Suspended';
  orgName?: string;
  industry?: string;
  timezone?: string;
  primaryContactMobile?: string;
  usersMax?: number;
}

export async function patchTenant(orgId: string, input: PatchTenantInput) {
  const res = await api.patch<Envelope<Org>>(`/platform/tenants/${orgId}`, input);
  return res.data;
}

export function impersonateTenant(orgId: string) {
  return api.post<{ token: string }>(`/platform/tenants/${orgId}/impersonate`);
}

export type AuditLogsParams = {
  actorId?: string;
  entity?: string;
  page?: number;
  pageSize?: number;
}

export function getAuditLogs(params: AuditLogsParams = {}) {
  return api.get<Paginated<AuditLogEntry>>('/audit-logs', params);
}
