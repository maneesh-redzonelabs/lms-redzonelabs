import { api, Paginated } from './client';
import type { Allocation } from './types';

export type AllocationsListParams = {
  status?: string;
  projectId?: string;
  page?: number;
  pageSize?: number;
}

export function listAllocations(params: AllocationsListParams = {}) {
  return api.get<Paginated<Allocation>>('/allocations', params);
}

export function getAllocation(id: string) {
  return api.get<Allocation>(`/allocations/${id}`);
}
