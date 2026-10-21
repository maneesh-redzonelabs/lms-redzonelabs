import { api, Paginated } from './client';
import type { User } from './types';

// Every backend route wraps its payload as `{ data: ... }` except paginated list endpoints
// (which return `{ data: T[], meta }` matching Paginated<T> as-is - see api/auth.ts for the
// full explanation). Single-object endpoints below unwrap it themselves.
interface Envelope<T> {
  data: T;
}

export type UsersListParams = {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function listUsers(params: UsersListParams = {}) {
  return api.get<Paginated<User>>('/users', params);
}

export async function getUser(id: string) {
  const res = await api.get<Envelope<User>>(`/users/${id}`);
  return res.data;
}

export interface CreateUserInput {
  name: string;
  mobile: string;
  email?: string;
  role: string;
  reportsTo?: string | null;
}

export async function createUser(input: CreateUserInput) {
  const res = await api.post<Envelope<User>>('/users', input);
  return res.data;
}

export async function patchUser(id: string, input: Partial<CreateUserInput & { status: string }>) {
  const res = await api.patch<Envelope<User>>(`/users/${id}`, input);
  return res.data;
}

export async function listManagers() {
  const res = await api.get<Envelope<User[]>>('/users/managers');
  return res.data;
}
