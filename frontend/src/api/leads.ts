import { api, Paginated } from './client';
import type { Lead, LeadActivity, LeadHistoryEntry } from './types';

export type LeadsListParams = {
  status?: string;
  projectId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export function listLeads(params: LeadsListParams = {}) {
  return api.get<Paginated<Lead>>('/leads', params);
}

export function getLead(id: string) {
  return api.get<Lead>(`/leads/${id}`);
}

export interface CreateLeadInput {
  name: string;
  mobile: string;
  email?: string;
  projectId?: string;
  budgetRange?: string;
  timeline?: string;
  source?: string;
  remarks?: string;
}

export function createLead(input: CreateLeadInput) {
  return api.post<Lead>('/leads', input);
}

export interface PatchLeadInput extends Partial<CreateLeadInput> {
  status?: string;
  ownerId?: string;
}

export function patchLead(id: string, input: PatchLeadInput, stepUpToken?: string) {
  return api.patch<Lead>(`/leads/${id}`, input, { stepUpToken });
}

export function deleteLead(id: string) {
  return api.delete<void>(`/leads/${id}`);
}

export function getLeadHistory(id: string) {
  return api.get<LeadHistoryEntry[]>(`/leads/${id}/history`);
}

export function getLeadActivities(id: string) {
  return api.get<LeadActivity[]>(`/leads/${id}/activities`);
}

export function addLeadActivity(id: string, input: { type: string; note?: string }) {
  return api.post<LeadActivity>(`/leads/${id}/activities`, input);
}

export interface BulkImportRow {
  rowNumber: number;
  valid: boolean;
  data: Record<string, string>;
  errors?: string[];
}

export interface BulkImportPreviewResult {
  importToken: string;
  rows: BulkImportRow[];
  validCount: number;
  invalidCount: number;
}

export function previewBulkImport(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<BulkImportPreviewResult>('/leads/bulk-import/preview', formData, {
    isFormData: true,
  });
}

export function commitBulkImport(importToken: string) {
  return api.post<{ created: number }>('/leads/bulk-import/commit', { importToken });
}

export async function downloadBulkImportTemplate(): Promise<Blob> {
  const res = await api.get<Response>(
    '/leads/bulk-import/template',
    undefined,
    { rawResponse: true }
  );
  return res.blob();
}
