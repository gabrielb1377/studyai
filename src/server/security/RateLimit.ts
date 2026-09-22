import "server-only";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  const timestamp = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= timestamp) { buckets.set(key, { count: 1, resetAt: timestamp + windowMs }); return { allowed: true, remaining: limit - 1 }; }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), retryAfter: Math.ceil((bucket.resetAt - timestamp) / 1000) };
}

export function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

