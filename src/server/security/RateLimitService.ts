import "server-only";

import { query, hasPostgres } from "@/server/database/Postgres";

export type RateLimitStatus = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
  retryAfter?: number;
};

function getWindowBucket(windowMs: number): number {
  return Math.floor(Date.now() / windowMs);
}

function getWindowEnd(windowMs: number): string {
  const now = Date.now();
  const nextWindow = new Date(Math.ceil(now / windowMs) * windowMs);
  return nextWindow.toISOString();
}

async function hasPostgresAsync(): Promise<boolean> {
  return (await import("@/server/database/Postgres")).hasPostgres();
}

export const RateLimitService = {
  async checkAndConsume(
    key: string,
    options: {
      limit: number;
      windowMs: number;
    }
  ): Promise<RateLimitStatus> {
    const windowBucket = getWindowBucket(options.windowMs);
    const windowEnd = getWindowEnd(options.windowMs);

    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      // In-memory fallback for development
      return { allowed: true, remaining: options.limit - 1, limit: options.limit, resetAt: windowEnd };
    }

    try {
      const result = await query(
        `INSERT INTO rate_limits (key, window_bucket, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (key, window_bucket)
         DO UPDATE SET count = rate_limits.count + 1
         RETURNING count`,
        [key, windowBucket]
      );

      const used = Number(result.rows[0]?.count ?? 1);
      const remaining = Math.max(0, options.limit - used);
      const allowed = used <= options.limit;

      if (!allowed) {
        return {
          allowed: false,
          remaining: 0,
          limit: options.limit,
          resetAt: windowEnd,
          retryAfter: Math.ceil((new Date(windowEnd).getTime() - Date.now()) / 1000),
        };
      }

      return {
        allowed: true,
        remaining,
        limit: options.limit,
        resetAt: windowEnd,
      };
    } catch (error) {
      // Fail-closed for security-critical rate limits
      // If we can't verify, don't allow the request
      throw error;
    }
  },

  async getStatus(key: string, options: { limit: number; windowMs: number }): Promise<RateLimitStatus> {
    const windowBucket = getWindowBucket(options.windowMs);
    const windowEnd = getWindowEnd(options.windowMs);

    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      return { allowed: true, remaining: options.limit, limit: options.limit, resetAt: windowEnd };
    }

    try {
      const result = await query(
        `SELECT COALESCE(count, 0) as used FROM rate_limits WHERE key = $1 AND window_bucket = $2`,
        [key, windowBucket]
      );

      const used = Number(result.rows[0]?.used ?? 0);
      const remaining = Math.max(0, options.limit - used);

      return {
        allowed: used < options.limit,
        remaining,
        limit: options.limit,
        resetAt: windowEnd,
      };
    } catch {
      return { allowed: true, remaining: options.limit, limit: options.limit, resetAt: windowEnd };
    }
  },

  async cleanup(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) return 0;

    const cutoffBucket = getWindowBucket(maxAgeMs);
    try {
      const result = await query(
        `DELETE FROM rate_limits WHERE window_bucket < $1`,
        [cutoffBucket]
      );
      return result.rowCount ?? 0;
    } catch {
      return 0;
    }
  },
};