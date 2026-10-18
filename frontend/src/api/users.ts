import { api, Paginated } from './client';
import type { User } from './types';

export type UsersListParams = {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function listUsers(params: UsersListParams = {}) {
  return api.get<Paginated<User>>('/users', params);
}

export function getUser(id: string) {
  return api.get<User>(`/users/${id}`);
}

export interface CreateUserInput {
  name: string;
  mobile: string;
  email?: string;
  role: string;
  reportsTo?: string | null;
}

export function createUser(input: CreateUserInput) {
  return api.post<User>('/users', input);
}

export function patchUser(id: string, input: Partial<CreateUserInput & { status: string }>) {
  return api.patch<User>(`/users/${id}`, input);
}

export function listManagers() {
  return api.get<User[]>('/users/managers');
}
