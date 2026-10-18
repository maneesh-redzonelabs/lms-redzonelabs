import { api, Paginated } from './client';
import type { Project, Unit } from './types';

export type ProjectsListParams = {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function listProjects(params: ProjectsListParams = {}) {
  return api.get<Paginated<Project>>('/projects', params);
}

export function getProject(id: string) {
  return api.get<Project>(`/projects/${id}`);
}

export interface InitialInventoryBatch {
  mode: 'apartment' | 'plot';
  tower?: string;
  floors?: number;
  unitsPerFloor?: number;
  plotPrefix?: string;
  plotCount?: number;
  plotStartNumber?: number;
}

export interface CreateProjectInput {
  name: string;
  type: string;
  status: string;
  location?: string;
  initialInventory?: InitialInventoryBatch;
}

export function createProject(input: CreateProjectInput) {
  return api.post<Project>('/projects', input);
}

export function patchProject(id: string, input: Partial<CreateProjectInput>) {
  return api.patch<Project>(`/projects/${id}`, input);
}

export type UnitsListParams = {
  status?: string;
  page?: number;
  pageSize?: number;
}

export function listUnits(projectId: string, params: UnitsListParams = {}) {
  return api.get<Paginated<Unit>>(`/projects/${projectId}/units`, params);
}

export function addUnits(projectId: string, batch: InitialInventoryBatch) {
  return api.post<Unit[]>(`/projects/${projectId}/units`, batch);
}

export function allocateUnit(unitId: string, leadId: string) {
  return api.post<Unit>(`/units/${unitId}/allocate`, { leadId });
}

export function reallocateUnit(unitId: string, leadId: string, stepUpToken: string) {
  return api.post<Unit>(`/units/${unitId}/reallocate`, { leadId }, { stepUpToken });
}

export function underwriteUnit(unitId: string) {
  return api.post<Unit>(`/units/${unitId}/underwrite`);
}

export function releaseHold(unitId: string) {
  return api.post<Unit>(`/units/${unitId}/release-hold`);
}
