import { api, Paginated } from './client';
import type { Org, AuditLogEntry } from './types';

export type TenantsListParams = {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function listTenants(params: TenantsListParams = {}) {
  return api.get<Paginated<Org>>('/platform/tenants', params);
}

export function patchTenant(orgId: string, input: Partial<Org>) {
  return api.patch<Org>(`/platform/tenants/${orgId}`, input);
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
