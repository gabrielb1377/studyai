import "server-only";

import { RateLimitService } from "./RateLimitService";

const buckets = new Map<string, { count: number; resetAt: number }>();

function inMemoryRateLimit(key: string, limit = 20, windowMs = 60_000) {
  const timestamp = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= timestamp) {
    buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), retryAfter: Math.ceil((bucket.resetAt - timestamp) / 1000) };
}

export async function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  try {
    return await RateLimitService.checkAndConsume(key, { limit, windowMs });
  } catch {
    // Fail-open for non-critical rate limits (e.g., API key set/test)
    // Fail-closed for critical rate limits would be handled by the caller
    return inMemoryRateLimit(key, limit, windowMs);
  }
}

export function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}