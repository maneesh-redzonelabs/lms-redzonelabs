import { api } from './client';
import type { DashboardSummary, UsersBreakdown, OrgHierarchyNode } from './types';

// Every backend route wraps its payload as `{ data: ... }`. apiRequest() in client.ts does not
// unwrap this generically (paginated list endpoints return `{ data: T[], meta }` and rely on both
// fields as-is), so single-object endpoints like these unwrap it themselves. See api/auth.ts.
interface Envelope<T> {
  data: T;
}

export async function getDashboardSummary() {
  const res = await api.get<Envelope<DashboardSummary>>('/dashboard/summary');
  return res.data;
}

export async function getUsersBreakdown() {
  const res = await api.get<Envelope<UsersBreakdown[]>>('/dashboard/users-breakdown');
  return res.data;
}

export async function getOrgHierarchy() {
  const res = await api.get<Envelope<OrgHierarchyNode>>('/org/hierarchy');
  return res.data;
}

export interface ProjectConversionRow {
  projectId: string;
  projectName: string;
  totalLeads: number;
  wonLeads: number;
  conversionRate: number;
}

export async function getProjectConversionReport() {
  const res = await api.get<Envelope<ProjectConversionRow[]>>('/reports/project-conversion');
  return res.data;
}

export interface SiteVisitRow {
  leadId: string;
  leadName: string;
  projectName?: string;
  scheduledAt: string;
  ownerName?: string;
}

export async function getTodaysSiteVisits() {
  const res = await api.get<Envelope<SiteVisitRow[]>>('/reports/todays-site-visits');
  return res.data;
}
