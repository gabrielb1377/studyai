import "server-only";

import { query } from "@/server/database/Postgres";

export type RateLimitStatus = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
  retryAfter?: number;
};

export const MIN_SAFE_RATE_LIMIT_CLEANUP_AGE_MS = 60 * 60 * 1000;
export const DEFAULT_RATE_LIMIT_CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;

let maxObservedWindowMs = MIN_SAFE_RATE_LIMIT_CLEANUP_AGE_MS;

function observeWindowMs(windowMs: number) {
  if (Number.isFinite(windowMs) && windowMs > maxObservedWindowMs) {
    maxObservedWindowMs = Math.trunc(windowMs);
  }
}

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
    observeWindowMs(options.windowMs);
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
    observeWindowMs(options.windowMs);
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

  async cleanup(maxAgeMs = DEFAULT_RATE_LIMIT_CLEANUP_AGE_MS): Promise<number> {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) return 0;

    // O piso mínimo nunca pode ser menor que a maior janela suportada (1h por padrão,
    // ou maior caso alguma rota registre windowMs superior), garantindo que um balde
    // ainda dentro de sua janela ativa [window_start, window_end) jamais seja removido.
    const minSafeAgeMs = Math.max(MIN_SAFE_RATE_LIMIT_CLEANUP_AGE_MS, maxObservedWindowMs);
    const requestedAgeMs = Number.isFinite(maxAgeMs)
      ? Math.trunc(maxAgeMs)
      : DEFAULT_RATE_LIMIT_CLEANUP_AGE_MS;
    const safeMaxAgeMs = Math.max(minSafeAgeMs, requestedAgeMs);
    try {
      const result = await query(
        `DELETE FROM rate_limits WHERE created_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')`,
        [safeMaxAgeMs]
      );
      return result.rowCount ?? 0;
    } catch {
      return 0;
    }
  },
};