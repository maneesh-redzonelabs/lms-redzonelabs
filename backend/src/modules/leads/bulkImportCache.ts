import { randomToken } from '../../utils/tokens';

export interface CachedImportRow {
  rowNumber: number;
  fullName: string;
  mobile: string;
  email: string | null;
  projectId: number | null;
  budgetId: number | null;
  timelineId: number | null;
  statusId: number | null;
  siteVisitDate: string | null;
  remarks: string | null;
  valid: boolean;
  errors: string[];
}

interface CacheEntry {
  orgId: number;
  userId: number;
  rows: CachedImportRow[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000;

export function storeImport(orgId: number, userId: number, rows: CachedImportRow[]): string {
  const token = randomToken(24);
  cache.set(token, { orgId, userId, rows, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function getImport(token: string): CacheEntry | null {
  const entry = cache.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(token);
    return null;
  }
  return entry;
}

export function dropImport(token: string): void {
  cache.delete(token);
}

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of cache.entries()) {
    if (entry.expiresAt < now) cache.delete(token);
  }
}, 60 * 1000).unref();
