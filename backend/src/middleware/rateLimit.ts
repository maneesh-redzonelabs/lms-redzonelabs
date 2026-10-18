/**
 * Small in-memory sliding-window rate limiter. No Redis - state lives in process
 * memory only and resets on server restart. Acceptable for a local single-instance
 * dev deployment; would need a shared store (Redis etc.) for multi-instance production.
 */

type Hit = number; // epoch ms

const buckets = new Map<string, Hit[]>();

function hit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < windowMs);
  fresh.push(now);
  buckets.set(key, fresh);
  return fresh.length <= max;
}

export function allow(key: string, windowMs: number, max: number): boolean {
  return hit(key, windowMs, max);
}

// Periodic sweep to avoid unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets.entries()) {
    const fresh = arr.filter((t) => now - t < 60 * 60 * 1000);
    if (fresh.length === 0) buckets.delete(k);
    else buckets.set(k, fresh);
  }
}, 5 * 60 * 1000).unref();

export const RateLimits = {
  LOGIN_PER_IP: { windowMs: 60 * 1000, max: 10 },
  ONBOARDING_VERIFY_PER_IP: { windowMs: 60 * 1000, max: 10 },
  AUTHED_PER_USER: { windowMs: 60 * 1000, max: 100 },
  BULK_IMPORT_PER_USER: { windowMs: 60 * 60 * 1000, max: 5 }
};
