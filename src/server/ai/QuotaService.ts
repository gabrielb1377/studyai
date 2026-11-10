import { query } from "@/server/database/Postgres";

const DAILY_LIMIT = 500;
const MINUTE_LIMIT = 20;

export type QuotaStatus = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
  retryAfter?: number;
  blockedBy?: "daily" | "minute";
  quota: QuotaInfo;
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
  const nextMinute = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
  return nextMinute.toISOString();
}

function getDayEnd(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

type LocalQuotaCounter = { date: string; minuteBucket: number; dailyUsed: number; minuteUsed: number };
const quotaRuntime = globalThis as typeof globalThis & { __studyAILocalQuota?: Map<string, LocalQuotaCounter> };
const localQuota = quotaRuntime.__studyAILocalQuota ?? new Map<string, LocalQuotaCounter>();
quotaRuntime.__studyAILocalQuota = localQuota;

function quotaInfo(dailyUsed: number, minuteUsed: number, sharedKeysUsed: boolean): QuotaInfo {
  return {
    daily: {
      used: dailyUsed,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - dailyUsed),
      resetAt: getDayEnd(),
    },
    minute: {
      used: minuteUsed,
      limit: MINUTE_LIMIT,
      remaining: Math.max(0, MINUTE_LIMIT - minuteUsed),
      resetAt: getMinuteBucketEnd(),
    },
    sharedKeysUsed,
  };
}

function decision(dailyUsed: number, minuteUsed: number): QuotaStatus {
  const quota = quotaInfo(dailyUsed, minuteUsed, true);
  const blockedBy = dailyUsed > DAILY_LIMIT ? "daily" : minuteUsed > MINUTE_LIMIT ? "minute" : undefined;
  const resetAt = blockedBy === "daily" ? quota.daily.resetAt : quota.minute.resetAt;
  return {
    allowed: blockedBy === undefined,
    remaining: blockedBy === "daily" ? quota.daily.remaining : quota.minute.remaining,
    limit: blockedBy === "daily" ? DAILY_LIMIT : MINUTE_LIMIT,
    resetAt,
    retryAfter: blockedBy
      ? Math.max(1, Math.ceil((Date.parse(resetAt) - Date.now()) / 1_000))
      : undefined,
    blockedBy,
    quota,
  };
}

function consumeLocal(userId: string): QuotaStatus {
  const date = getDateString();
  const minuteBucket = getMinuteBucket();
  const current = localQuota.get(userId);
  const dailyUsed = current?.date === date ? current.dailyUsed + 1 : 1;
  const minuteUsed = current?.date === date && current.minuteBucket === minuteBucket ? current.minuteUsed + 1 : 1;
  localQuota.set(userId, { date, minuteBucket, dailyUsed, minuteUsed });
  return decision(dailyUsed, minuteUsed);
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
      return {
        allowed: true,
        remaining: Infinity,
        limit: Infinity,
        resetAt: getDayEnd(),
        quota: quotaInfo(0, 0, false),
      } satisfies QuotaStatus;
    }

    const dateStr = getDateString();

    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      if (process.env.NODE_ENV === "production") {
        throw Object.assign(new Error("Armazenamento de quota indisponível."), { code: "QUOTA_STORAGE_UNAVAILABLE" });
      }
      // Contador local determinístico apenas para desenvolvimento e testes.
      return consumeLocal(userId);
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

      const dailyUsed = Number(dailyResult.rows[0]?.requests_count ?? 1);
      const minuteUsed = Number(minuteResult.rows[0]?.requests_count ?? 1);
      return decision(dailyUsed, minuteUsed);
    } catch (error) {
      // Fail-closed: a quota indisponível nunca deve liberar uso ilimitado
      // da credencial compartilhada. O erro é propagado ao middleware.
      throw error;
    }
  },

  async getQuotaInfo(userId: string) {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      if (process.env.NODE_ENV === "production") {
        throw Object.assign(new Error("Armazenamento de quota indisponível."), { code: "QUOTA_STORAGE_UNAVAILABLE" });
      }
      const current = localQuota.get(userId);
      const date = getDateString();
      const minuteBucket = getMinuteBucket();
      return quotaInfo(
        current?.date === date ? current.dailyUsed : 0,
        current?.date === date && current.minuteBucket === minuteBucket ? current.minuteUsed : 0,
        Boolean(current?.date === date && current.dailyUsed > 0),
      );
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

    return quotaInfo(dailyUsed, minuteUsed, dailyUsed > 0 || minuteUsed > 0);
  },

  async getUsageStats(userId: string, days = 30) {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) return [];

    const safeDays = Math.min(365, Math.max(1, Math.trunc(days)));

    const result = await query(
      // Apenas a linha consolidada do dia (minute_bucket = 0) para não
      // duplicar o total diário com as linhas de minuto.
      `SELECT date, requests_count as requests, tokens_count as tokens
       FROM usage_quotas
       WHERE user_id = $1 AND minute_bucket = 0 AND date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
       ORDER BY date DESC`,
      [userId, safeDays]
    );

    return result.rows.map((row) => ({
      date: row.date,
      requests: Number(row.requests),
      tokens: Number(row.tokens),
    }));
  },
};
