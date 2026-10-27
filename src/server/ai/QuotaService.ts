import { query, hasPostgres } from "@/server/database/Postgres";
import { requireUser } from "@/server/auth/http";
import { aiProviderIds, type AIProviderId } from "@/features/ai/AIProvider";

const DAILY_LIMIT = 500;
const MINUTE_LIMIT = 20;

export type QuotaStatus = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
  retryAfter?: number;
};

export type QuotaInfo = {
  daily: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
  };
  minute: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
  };
  sharedKeysUsed: boolean;
};

function getMinuteBucket(): number {
  return Math.floor(Date.now() / 60_000);
}

function getDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function getMinuteBucketEnd(): string {
  const now = new Date();
  const nextMinute = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
  return nextMinute.toISOString();
}

function getDayEnd(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return tomorrow.toISOString();
}

async function hasPostgresAsync(): Promise<boolean> {
  return (await import("@/server/database/Postgres")).hasPostgres();
}

export const QuotaService = {
  async checkAndConsume(
    userId: string,
    options: {
      provider: string;
      tokens?: number;
      useSharedKeys: boolean;
    }
  ) {
    if (!options.useSharedKeys) {
      return { allowed: true, remaining: Infinity, limit: Infinity, resetAt: getDayEnd() };
    }

    const dateStr = getDateString();

    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      // In-memory fallback for development
      return { allowed: true, remaining: 500, limit: 500, resetAt: getDayEnd() };
    }

    try {
      const dailyResult = await query(
        `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
         VALUES ($1, $2, 0, 1, COALESCE($3, 0))
         ON CONFLICT (user_id, date, minute_bucket)
         DO UPDATE SET requests_count = usage_quotas.requests_count + 1, tokens_count = usage_quotas.tokens_count + COALESCE($3, 0)
         RETURNING requests_count, tokens_count`,
        [userId, dateStr, 0]
      );

      const minuteResult = await query(
        `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
         VALUES ($1, $2, $3, 1, COALESCE($4, 0))
         ON CONFLICT (user_id, date, minute_bucket)
         DO UPDATE SET requests_count = usage_quotas.requests_count + 1, tokens_count = usage_quotas.tokens_count + COALESCE($4, 0)
         RETURNING requests_count, tokens_count`,
        [userId, dateStr, getMinuteBucket(), 0]
      );

      const dailyUsed = dailyResult.rows[0]?.requests_count ?? 1;
      const minuteUsed = minuteResult.rows[0]?.requests_count ?? 1;

      const dailyRemaining = Math.max(0, 500 - dailyUsed);
      const minuteRemaining = Math.max(0, 20 - minuteUsed);

      const allowed = dailyUsed <= 500 && minuteUsed <= 20;
      const remaining = Math.min(dailyRemaining, minuteRemaining);

      if (!allowed) {
        return {
          allowed: false,
          remaining: 0,
          limit: Math.min(500, 20),
          resetAt: minuteRemaining <= 0 ? new Date(Math.ceil(Date.now() / 60_000) * 60_000).toISOString() : new Date().toISOString(),
          retryAfter: minuteRemaining <= 0 ? Math.ceil((Math.ceil(Date.now() / 60_000) * 60_000 - Date.now()) / 1000) : undefined,
        };
      }

      return {
        allowed: true,
        remaining: Math.min(dailyRemaining, minuteRemaining),
        limit: 20,
        resetAt: getMinuteBucketEnd(),
      };
    } catch (error) {
      // Fail-closed: a quota indisponível nunca deve liberar uso ilimitado
      // da credencial compartilhada. O erro é propagado ao middleware.
      throw error;
    }
  },

  async getQuotaInfo(userId: string) {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      return {
        daily: { used: 0, limit: 500, remaining: 500, resetAt: getDayEnd() },
        minute: { used: 0, limit: 20, remaining: 20, resetAt: getMinuteBucketEnd() },
        sharedKeysUsed: false,
      };
    }

    const dateStr = getDateString();

    const [dailyResult, minuteResult] = await Promise.all([
      // minute_bucket = 0 guarda o contador diário consolidado. Somar todas as
      // linhas do dia contaria cada requisição duas vezes (dia + minuto).
      query(
        "SELECT COALESCE(requests_count, 0) as used FROM usage_quotas WHERE user_id = $1 AND date = $2 AND minute_bucket = 0",
        [userId, dateStr]
      ),
      query(
        "SELECT COALESCE(SUM(requests_count), 0) as used FROM usage_quotas WHERE user_id = $1 AND date = $2 AND minute_bucket = $3",
        [userId, dateStr, getMinuteBucket()]
      ),
    ]);

    const dailyUsed = Number(dailyResult.rows[0]?.used ?? 0);
    const minuteUsed = Number(minuteResult.rows[0]?.used ?? 0);

    const dayEnd = new Date();
    dayEnd.setHours(24, 0, 0, 0);
    const minuteEnd = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
    return {
      daily: {
        used: dailyUsed,
        limit: 500,
        remaining: Math.max(0, 500 - dailyUsed),
        resetAt: dayEnd.toISOString(),
      },
      minute: {
        used: minuteUsed,
        limit: 20,
        remaining: Math.max(0, 20 - minuteUsed),
        resetAt: minuteEnd.toISOString(),
      },
      sharedKeysUsed: dailyUsed > 0 || minuteUsed > 0,
    };
  },

  async getUsageStats(userId: string, days = 30) {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) return [];

    const result = await query(
      // Apenas a linha consolidada do dia (minute_bucket = 0) para não
      // duplicar o total diário com as linhas de minuto.
      `SELECT date, requests_count as requests, tokens_count as tokens
       FROM usage_quotas
       WHERE user_id = $1 AND minute_bucket = 0 AND date >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY date DESC`,
      [userId]
    );

    return result.rows.map((row) => ({
      date: row.date,
      requests: Number(row.requests),
      tokens: Number(row.tokens),
    }));
  },
};