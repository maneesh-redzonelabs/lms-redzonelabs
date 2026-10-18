function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * Recursively converts snake_case object keys to camelCase.
 * Several route handlers return raw `pg` row objects (snake_case DB columns);
 * this keeps the public API contract consistently camelCase without requiring
 * every handler to hand-map its response.
 */
export function deepCamelCase<T = any>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map((item) => deepCamelCase(item)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      out[snakeToCamel(k)] = deepCamelCase(v);
    }
    return out as T;
  }
  return value;
}
