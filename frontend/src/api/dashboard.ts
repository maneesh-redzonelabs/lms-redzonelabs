import { api } from './client';
import type { DashboardSummary, UsersBreakdown, OrgHierarchyNode } from './types';

export function getDashboardSummary() {
  return api.get<DashboardSummary>('/dashboard/summary');
}

export function getUsersBreakdown() {
  return api.get<UsersBreakdown[]>('/dashboard/users-breakdown');
}

export function getOrgHierarchy() {
  return api.get<OrgHierarchyNode>('/org/hierarchy');
}

export interface ProjectConversionRow {
  projectId: string;
  projectName: string;
  totalLeads: number;
  wonLeads: number;
  conversionRate: number;
}

export function getProjectConversionReport() {
  return api.get<ProjectConversionRow[]>('/reports/project-conversion');
}

export interface SiteVisitRow {
  leadId: string;
  leadName: string;
  projectName?: string;
  scheduledAt: string;
  ownerName?: string;
}

export function getTodaysSiteVisits() {
  return api.get<SiteVisitRow[]>('/reports/todays-site-visits');
}
