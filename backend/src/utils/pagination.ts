export function parsePagination(query: any): { page: number; pageSize: number; offset: number } {
  let page = parseInt(query?.page, 10);
  let pageSize = parseInt(query?.pageSize, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * Parses a `?sort=field:asc|desc` param against a per-endpoint whitelist map
 * (query param name -> actual SQL column/expression) to prevent SQL injection
 * via column names. Returns a safe "ORDER BY ..." fragment (no leading space trimming needed).
 */
export function parseSort(
  sortParam: string | undefined,
  whitelist: Record<string, string>,
  defaultSort: string
): string {
  if (!sortParam) return defaultSort;
  const [field, dirRaw] = sortParam.split(':');
  const dir = (dirRaw || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const column = whitelist[field];
  if (!column) return defaultSort;
  return `${column} ${dir}`;
}

export function listEnvelope<T>(data: T[], page: number, pageSize: number, total: number) {
  return { data, meta: { page, pageSize, total } };
}
