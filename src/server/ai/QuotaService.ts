import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AIUsageSettlement, AIUsageSource } from "@/features/ai/AIProvider";
import { query, transaction } from "@/server/database/Postgres";

const DEFAULT_DAILY_LIMIT = 500;
const DEFAULT_MINUTE_LIMIT = 20;
// Limites conservadores em TOKENS (não representam teto financeiro monetário exato).
const DEFAULT_USER_DAILY_TOKEN_LIMIT = 250_000;
const DEFAULT_GLOBAL_DAILY_TOKEN_BUDGET = 5_000_000;
const DEFAULT_RESERVATION_TTL_MS = 5 * 60_000;
const DEFAULT_QUOTA_CLEANUP_BATCH_LIMIT = 10_000;
const MAX_QUOTA_CLEANUP_BATCH_LIMIT = 50_000;
const RESERVATION_HISTORY_RETAIN_DAYS = 30;

function parsePositiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^[0-9]+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getQuotaLimitsConfig() {
  return {
    dailyRequestLimit: parsePositiveIntEnv("AI_USER_DAILY_REQUEST_LIMIT", DEFAULT_DAILY_LIMIT, 1, 100_000),
    minuteRequestLimit: parsePositiveIntEnv("AI_USER_MINUTE_REQUEST_LIMIT", DEFAULT_MINUTE_LIMIT, 1, 10_000),
    userDailyTokenLimit: parsePositiveIntEnv("AI_USER_DAILY_TOKEN_LIMIT", DEFAULT_USER_DAILY_TOKEN_LIMIT, 100, 100_000_000),
    globalDailyTokenBudget: parsePositiveIntEnv("AI_GLOBAL_DAILY_TOKEN_BUDGET", DEFAULT_GLOBAL_DAILY_TOKEN_BUDGET, 100, 1_000_000_000),
    reservationTtlMs: parsePositiveIntEnv("AI_RESERVATION_TTL_MS", DEFAULT_RESERVATION_TTL_MS, 5_000, 30 * 60_000),
  };
}

export type QuotaBlockReason = "daily" | "minute" | "user_tokens" | "global_budget";

export type QuotaStatus = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
  retryAfter?: number;
  blockedBy?: QuotaBlockReason;
  quota: QuotaInfo;
  reservationId?: string;
  reservedTokens?: number;
  deduplicated?: boolean;
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
  tokens?: {
    used: number;
    reserved: number;
    limit: number;
    remaining: number;
    resetAt: string;
  };
  sharedKeysUsed: boolean;
};

export type TokenEstimate = {
  inputEstimate: number;
  outputEstimate: number;
  reserveTokens: number;
};

export type ReconcileResult = {
  reconciled: boolean;
  alreadySettled?: boolean;
  chargedTokens: number;
  releasedTokens: number;
  usageSource: AIUsageSource;
  status: "reconciled" | "failed" | "cancelled" | "expired";
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

function estimateTextTokensConservative(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  // Estimativa conservadora para reserva/fallback (nunca apresentada como métrica oficial do provedor).
  return Math.max(1, Math.ceil(trimmed.length / 3));
}

export function estimateReservationTokens(input: {
  history?: readonly { content: string }[];
  message?: string;
  maxOutputTokens?: number;
}): TokenEstimate {
  let inputChars = (input.message ?? "").length;
  for (const item of input.history ?? []) {
    inputChars += (item.content ?? "").length + 12;
  }
  const inputEstimate = Math.max(64, Math.ceil(inputChars / 3));
  const rawOutput = typeof input.maxOutputTokens === "number" && Number.isFinite(input.maxOutputTokens)
    ? Math.trunc(input.maxOutputTokens)
    : 2_048;
  const outputEstimate = Math.min(16_384, Math.max(256, rawOutput));
  return {
    inputEstimate,
    outputEstimate,
    reserveTokens: inputEstimate + outputEstimate,
  };
}

type LocalReservation = {
  id: string;
  requestId: string;
  userId: string;
  usageDate: string;
  provider: string;
  model?: string;
  credentialOrigin: "shared" | "byok" | "local";
  reservedTokens: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  actualTotalTokens?: number;
  usageSource: "reserved" | AIUsageSource;
  status: "reserved" | "reconciled" | "failed" | "cancelled" | "expired";
  expiresAtMs: number;
};

type LocalQuotaCounter = {
  date: string;
  minuteBucket: number;
  dailyUsed: number;
  minuteUsed: number;
  tokensUsed: number;
  tokensReserved: number;
};

type LocalGlobalBudget = {
  date: string;
  reservedTokens: number;
  consumedTokens: number;
  requestsCount: number;
};

const quotaRuntime = globalThis as typeof globalThis & {
  __studyAILocalQuota?: Map<string, LocalQuotaCounter>;
  __studyAILocalGlobalBudget?: LocalGlobalBudget;
  __studyAILocalReservations?: Map<string, LocalReservation>;
};
const localQuota = quotaRuntime.__studyAILocalQuota ?? new Map<string, LocalQuotaCounter>();
quotaRuntime.__studyAILocalQuota = localQuota;
const localReservations = quotaRuntime.__studyAILocalReservations ?? new Map<string, LocalReservation>();
quotaRuntime.__studyAILocalReservations = localReservations;

function getLocalGlobalBudget(date: string): LocalGlobalBudget {
  if (!quotaRuntime.__studyAILocalGlobalBudget || quotaRuntime.__studyAILocalGlobalBudget.date !== date) {
    quotaRuntime.__studyAILocalGlobalBudget = { date, reservedTokens: 0, consumedTokens: 0, requestsCount: 0 };
  }
  return quotaRuntime.__studyAILocalGlobalBudget;
}

function quotaInfo(
  dailyUsed: number,
  minuteUsed: number,
  sharedKeysUsed: boolean,
  tokensUsed = 0,
  tokensReserved = 0,
): QuotaInfo {
  const limits = getQuotaLimitsConfig();
  const dayEnd = getDayEnd();
  const activeTokens = tokensUsed + tokensReserved;
  return {
    daily: {
      used: dailyUsed,
      limit: limits.dailyRequestLimit,
      remaining: Math.max(0, limits.dailyRequestLimit - dailyUsed),
      resetAt: dayEnd,
    },
    minute: {
      used: minuteUsed,
      limit: limits.minuteRequestLimit,
      remaining: Math.max(0, limits.minuteRequestLimit - minuteUsed),
      resetAt: getMinuteBucketEnd(),
    },
    tokens: {
      used: tokensUsed,
      reserved: tokensReserved,
      limit: limits.userDailyTokenLimit,
      remaining: Math.max(0, limits.userDailyTokenLimit - activeTokens),
      resetAt: dayEnd,
    },
    sharedKeysUsed,
  };
}

function decision(
  dailyUsed: number,
  minuteUsed: number,
  options: {
    tokensUsed?: number;
    tokensReserved?: number;
    blockedBy?: QuotaBlockReason;
    reservationId?: string;
    reservedTokens?: number;
    deduplicated?: boolean;
  } = {},
): QuotaStatus {
  const limits = getQuotaLimitsConfig();
  const quota = quotaInfo(dailyUsed, minuteUsed, true, options.tokensUsed ?? 0, options.tokensReserved ?? 0);
  const blockedBy = options.blockedBy
    ?? (dailyUsed > limits.dailyRequestLimit
      ? "daily"
      : minuteUsed > limits.minuteRequestLimit
        ? "minute"
        : undefined);
  const resetAt = blockedBy === "minute" ? quota.minute.resetAt : quota.daily.resetAt;
  const limit = blockedBy === "minute"
    ? limits.minuteRequestLimit
    : blockedBy === "user_tokens"
      ? limits.userDailyTokenLimit
      : limits.dailyRequestLimit;
  const remaining = blockedBy === "minute"
    ? quota.minute.remaining
    : blockedBy === "user_tokens"
      ? (quota.tokens?.remaining ?? 0)
      : blockedBy === "global_budget"
        ? 0
        : quota.daily.remaining;
  return {
    allowed: blockedBy === undefined,
    remaining,
    limit,
    resetAt,
    retryAfter: blockedBy
      ? Math.max(1, Math.ceil((Date.parse(resetAt) - Date.now()) / 1_000))
      : undefined,
    blockedBy,
    quota,
    reservationId: options.reservationId,
    reservedTokens: options.reservedTokens,
    deduplicated: options.deduplicated,
  };
}

function reclaimExpiredLocalReservations(date: string) {
  const nowMs = Date.now();
  const globalBudget = getLocalGlobalBudget(date);
  for (const res of localReservations.values()) {
    if (res.status === "reserved" && res.expiresAtMs <= nowMs) {
      res.status = "expired";
      if (res.usageDate === date) {
        globalBudget.reservedTokens = Math.max(0, globalBudget.reservedTokens - res.reservedTokens);
        const userCounter = localQuota.get(res.userId);
        if (userCounter && userCounter.date === date) {
          userCounter.tokensReserved = Math.max(0, userCounter.tokensReserved - res.reservedTokens);
        }
      }
    }
  }
}

async function reclaimExpiredPostgresReservations(client: PoolClient, batchLimit = DEFAULT_QUOTA_CLEANUP_BATCH_LIMIT): Promise<number> {
  const expired = await client.query<{
    id: string;
    user_id: string;
    usage_date: string;
    reserved_tokens: string;
  }>(
    `UPDATE ai_token_reservations
     SET status = 'expired', reconciled_at = NOW()
     WHERE id IN (
       SELECT id FROM ai_token_reservations
       WHERE status = 'reserved' AND expires_at <= NOW()
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, user_id, usage_date::text AS usage_date, reserved_tokens::text AS reserved_tokens`,
    [batchLimit],
  );

  for (const row of expired.rows) {
    const tokens = Number(row.reserved_tokens);
    if (tokens > 0) {
      await client.query(
        `UPDATE ai_global_daily_budgets
         SET reserved_tokens = GREATEST(0, reserved_tokens - $2), updated_at = NOW()
         WHERE date = $1::date`,
        [row.usage_date, tokens],
      );
      await client.query(
        `UPDATE usage_quotas
         SET reserved_tokens = GREATEST(0, reserved_tokens - $3), updated_at = NOW()
         WHERE user_id = $1 AND date = $2::date AND minute_bucket = 0`,
        [row.user_id, row.usage_date, tokens],
      );
    }
  }
  return expired.rowCount ?? 0;
}

function resolveSettlementCharge(
  reservedTokens: number,
  settlement: AIUsageSettlement,
  inputEstimate?: number,
): {
  status: "reconciled" | "failed" | "cancelled";
  usageSource: AIUsageSource;
  inputTokens: number | null;
  outputTokens: number | null;
  chargedTokens: number;
} {
  if (settlement.outcome === "cached") {
    return { status: "reconciled", usageSource: "provider", inputTokens: 0, outputTokens: 0, chargedTokens: 0 };
  }

  if (settlement.outcome === "completed") {
    const u = settlement.usage;
    const hasInput = typeof u?.inputTokens === "number" && Number.isFinite(u.inputTokens) && u.inputTokens >= 0;
    const hasOutput = typeof u?.outputTokens === "number" && Number.isFinite(u.outputTokens) && u.outputTokens >= 0;
    const hasTotal = typeof u?.totalTokens === "number" && Number.isFinite(u.totalTokens) && u.totalTokens >= 0;
    if (u?.source === "provider" && (hasTotal || (hasInput && hasOutput))) {
      const inputTokens = hasInput ? Math.trunc(u.inputTokens!) : null;
      const outputTokens = hasOutput ? Math.trunc(u.outputTokens!) : null;
      const totalTokens = hasTotal ? Math.trunc(u.totalTokens!) : (inputTokens ?? 0) + (outputTokens ?? 0);
      return {
        status: "reconciled",
        usageSource: "provider",
        inputTokens,
        outputTokens,
        chargedTokens: Math.max(0, totalTokens),
      };
    }

    // Sem métricas oficiais do provedor: política conservadora (nunca zera nem mascara como métrica real).
    if (settlement.emittedText && settlement.emittedText.trim().length > 0) {
      const outEst = estimateTextTokensConservative(settlement.emittedText);
      const inEst = Math.max(64, Math.trunc(inputEstimate ?? Math.floor(reservedTokens * 0.5)));
      const conservativeTotal = Math.max(inEst + outEst, Math.min(reservedTokens, inEst + outEst));
      return {
        status: "reconciled",
        usageSource: "estimated",
        inputTokens: null,
        outputTokens: null,
        chargedTokens: conservativeTotal,
      };
    }
    return {
      status: "reconciled",
      usageSource: "unknown",
      inputTokens: null,
      outputTokens: null,
      chargedTokens: reservedTokens,
    };
  }

  // Falha ou cancelamento:
  const finalStatus = settlement.outcome === "cancelled" ? "cancelled" : "failed";
  if (!settlement.providerContacted && !settlement.emittedOutput) {
    return { status: finalStatus, usageSource: "provider", inputTokens: 0, outputTokens: 0, chargedTokens: 0 };
  }
  // Provedor já foi contatado ou houve streaming parcial: não liberar indevidamente orçamento consumido.
  const emittedEst = settlement.emittedText ? estimateTextTokensConservative(settlement.emittedText) : 0;
  const baseFloor = Math.max(64, Math.trunc(inputEstimate ?? Math.ceil(reservedTokens * 0.25)));
  const conservativeCharge = Math.min(reservedTokens, Math.max(baseFloor + emittedEst, Math.ceil(reservedTokens * 0.25)));
  return {
    status: finalStatus,
    usageSource: emittedEst > 0 ? "estimated" : "unknown",
    inputTokens: null,
    outputTokens: null,
    chargedTokens: conservativeCharge,
  };
}

async function hasPostgresAsync(): Promise<boolean> {
  return (await import("@/server/database/Postgres")).hasPostgres();
}

export const QuotaService = {
  /**
   * Verifica no servidor se o e-mail do usuário está confirmado (`users.email_verified_at`).
   * Nunca confia em estado enviado pelo cliente. Em produção falha fechado se o banco estiver indisponível.
   */
  async isEmailVerified(userId: string): Promise<boolean> {
    if (!userId) return false;
    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      if (process.env.NODE_ENV === "production") {
        throw Object.assign(new Error("Banco de dados indisponível para verificar e-mail."), { code: "QUOTA_STORAGE_UNAVAILABLE" });
      }
      const mem = (globalThis as typeof globalThis & {
        __studyAiCloudMemory?: { users?: Map<string, { emailVerifiedAt?: string }> };
      }).__studyAiCloudMemory;
      return Boolean(mem?.users?.get(userId)?.emailVerifiedAt);
    }
    const result = await query<{ email_verified_at: Date | string | null }>(
      "SELECT email_verified_at FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );
    return Boolean(result.rows[0]?.email_verified_at);
  },

  /**
   * Reserva atomicamente capacidade de requisições + tokens (usuário + orçamento global)
   * antes de acionar qualquer provedor com chave compartilhada.
   */
  async reserveSharedBudget(
    userId: string,
    options: {
      provider: string;
      model?: string;
      requestId?: string;
      reserveTokens: number;
      useSharedKeys: boolean;
    },
  ): Promise<QuotaStatus> {
    if (!options.useSharedKeys) {
      return {
        allowed: true,
        remaining: Infinity,
        limit: Infinity,
        resetAt: getDayEnd(),
        quota: quotaInfo(0, 0, false),
      };
    }

    const limits = getQuotaLimitsConfig();
    const dateStr = getDateString();
    const minuteBucket = getMinuteBucket();
    const safeReserveTokens = Math.max(1, Math.min(100_000, Math.trunc(options.reserveTokens)));
    const effectiveRequestId = options.requestId?.trim() || randomUUID();
    const reservationId = randomUUID();

    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      if (process.env.NODE_ENV === "production") {
        throw Object.assign(new Error("Armazenamento de quota indisponível."), { code: "QUOTA_STORAGE_UNAVAILABLE" });
      }
      reclaimExpiredLocalReservations(dateStr);
      const existing = [...localReservations.values()].find(
        (r) => r.userId === userId && r.requestId === effectiveRequestId,
      );
      const current = localQuota.get(userId);
      const dailyUsed = current?.date === dateStr ? current.dailyUsed : 0;
      const minuteUsed = current?.date === dateStr && current.minuteBucket === minuteBucket ? current.minuteUsed : 0;
      const tokensUsed = current?.date === dateStr ? current.tokensUsed : 0;
      const tokensReserved = current?.date === dateStr ? current.tokensReserved : 0;

      if (existing) {
        return decision(dailyUsed, minuteUsed, {
          tokensUsed,
          tokensReserved,
          reservationId: existing.id,
          reservedTokens: existing.reservedTokens,
          deduplicated: true,
        });
      }

      const globalBudget = getLocalGlobalBudget(dateStr);
      if (minuteUsed + 1 > limits.minuteRequestLimit) {
        return decision(dailyUsed, minuteUsed + 1, { tokensUsed, tokensReserved, blockedBy: "minute" });
      }
      if (dailyUsed + 1 > limits.dailyRequestLimit) {
        return decision(dailyUsed + 1, minuteUsed, { tokensUsed, tokensReserved, blockedBy: "daily" });
      }
      if (tokensUsed + tokensReserved + safeReserveTokens > limits.userDailyTokenLimit) {
        return decision(dailyUsed, minuteUsed, { tokensUsed, tokensReserved, blockedBy: "user_tokens" });
      }
      if (globalBudget.consumedTokens + globalBudget.reservedTokens + safeReserveTokens > limits.globalDailyTokenBudget) {
        return decision(dailyUsed, minuteUsed, { tokensUsed, tokensReserved, blockedBy: "global_budget" });
      }

      const nextDaily = dailyUsed + 1;
      const nextMinute = minuteUsed + 1;
      const nextTokensReserved = tokensReserved + safeReserveTokens;
      localQuota.set(userId, {
        date: dateStr,
        minuteBucket,
        dailyUsed: nextDaily,
        minuteUsed: nextMinute,
        tokensUsed,
        tokensReserved: nextTokensReserved,
      });
      globalBudget.reservedTokens += safeReserveTokens;
      globalBudget.requestsCount += 1;
      localReservations.set(reservationId, {
        id: reservationId,
        requestId: effectiveRequestId,
        userId,
        usageDate: dateStr,
        provider: options.provider,
        model: options.model,
        credentialOrigin: "shared",
        reservedTokens: safeReserveTokens,
        usageSource: "reserved",
        status: "reserved",
        expiresAtMs: Date.now() + limits.reservationTtlMs,
      });
      return decision(nextDaily, nextMinute, {
        tokensUsed,
        tokensReserved: nextTokensReserved,
        reservationId,
        reservedTokens: safeReserveTokens,
      });
    }

    return transaction(async (client) => {
      // 1) Idempotência por (user_id, request_id)
      const existingRes = await client.query<{
        id: string;
        reserved_tokens: string;
      }>(
        "SELECT id, reserved_tokens::text AS reserved_tokens FROM ai_token_reservations WHERE user_id = $1 AND request_id = $2",
        [userId, effectiveRequestId],
      );
      if (existingRes.rows[0]) {
        const [dRes, mRes] = await Promise.all([
          client.query<{ requests_count: string; tokens_count: string; reserved_tokens: string }>(
            "SELECT requests_count::text, tokens_count::text, reserved_tokens::text FROM usage_quotas WHERE user_id=$1 AND date=$2::date AND minute_bucket=0",
            [userId, dateStr],
          ),
          client.query<{ requests_count: string }>(
            "SELECT requests_count::text FROM usage_quotas WHERE user_id=$1 AND date=$2::date AND minute_bucket=$3",
            [userId, dateStr, minuteBucket],
          ),
        ]);
        return decision(
          Number(dRes.rows[0]?.requests_count ?? 1),
          Number(mRes.rows[0]?.requests_count ?? 1),
          {
            tokensUsed: Number(dRes.rows[0]?.tokens_count ?? 0),
            tokensReserved: Number(dRes.rows[0]?.reserved_tokens ?? 0),
            reservationId: existingRes.rows[0].id,
            reservedTokens: Number(existingRes.rows[0].reserved_tokens),
            deduplicated: true,
          },
        );
      }

      // 2) Reclamar reservas abandonadas expiradas (em lote pequeno para baixa latência)
      await reclaimExpiredPostgresReservations(client, 100);

      // 3) Lock determinístico: orçamento global -> cota diária do usuário -> cota de minuto
      await client.query(
        "INSERT INTO ai_global_daily_budgets (date, reserved_tokens, consumed_tokens, requests_count) VALUES ($1::date, 0, 0, 0) ON CONFLICT (date) DO NOTHING",
        [dateStr],
      );
      const globalRow = await client.query<{ reserved_tokens: string; consumed_tokens: string }>(
        "SELECT reserved_tokens::text, consumed_tokens::text FROM ai_global_daily_budgets WHERE date = $1::date FOR UPDATE",
        [dateStr],
      );
      const globalReserved = Number(globalRow.rows[0]?.reserved_tokens ?? 0);
      const globalConsumed = Number(globalRow.rows[0]?.consumed_tokens ?? 0);

      await client.query(
        `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count, reserved_tokens)
         VALUES ($1, $2::date, 0, 0, 0, 0)
         ON CONFLICT (user_id, date, minute_bucket) DO NOTHING`,
        [userId, dateStr],
      );
      const userDailyRow = await client.query<{ requests_count: string; tokens_count: string; reserved_tokens: string }>(
        `SELECT requests_count::text, tokens_count::text, reserved_tokens::text
         FROM usage_quotas
         WHERE user_id = $1 AND date = $2::date AND minute_bucket = 0
         FOR UPDATE`,
        [userId, dateStr],
      );
      const dailyUsed = Number(userDailyRow.rows[0]?.requests_count ?? 0);
      const userTokensUsed = Number(userDailyRow.rows[0]?.tokens_count ?? 0);
      const userTokensReserved = Number(userDailyRow.rows[0]?.reserved_tokens ?? 0);

      await client.query(
        `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count, reserved_tokens)
         VALUES ($1, $2::date, $3, 0, 0, 0)
         ON CONFLICT (user_id, date, minute_bucket) DO NOTHING`,
        [userId, dateStr, minuteBucket],
      );
      const userMinuteRow = await client.query<{ requests_count: string }>(
        `SELECT requests_count::text
         FROM usage_quotas
         WHERE user_id = $1 AND date = $2::date AND minute_bucket = $3
         FOR UPDATE`,
        [userId, dateStr, minuteBucket],
      );
      const minuteUsed = Number(userMinuteRow.rows[0]?.requests_count ?? 0);

      // 4) Validar todos os tetos antes de consumir
      if (minuteUsed + 1 > limits.minuteRequestLimit) {
        return decision(dailyUsed, minuteUsed + 1, {
          tokensUsed: userTokensUsed,
          tokensReserved: userTokensReserved,
          blockedBy: "minute",
        });
      }
      if (dailyUsed + 1 > limits.dailyRequestLimit) {
        return decision(dailyUsed + 1, minuteUsed, {
          tokensUsed: userTokensUsed,
          tokensReserved: userTokensReserved,
          blockedBy: "daily",
        });
      }
      if (userTokensUsed + userTokensReserved + safeReserveTokens > limits.userDailyTokenLimit) {
        return decision(dailyUsed, minuteUsed, {
          tokensUsed: userTokensUsed,
          tokensReserved: userTokensReserved,
          blockedBy: "user_tokens",
        });
      }
      if (globalConsumed + globalReserved + safeReserveTokens > limits.globalDailyTokenBudget) {
        return decision(dailyUsed, minuteUsed, {
          tokensUsed: userTokensUsed,
          tokensReserved: userTokensReserved,
          blockedBy: "global_budget",
        });
      }

      // 5) Reservar atomicamente
      await client.query(
        `UPDATE usage_quotas
         SET requests_count = requests_count + 1,
             reserved_tokens = reserved_tokens + $3,
             updated_at = NOW()
         WHERE user_id = $1 AND date = $2::date AND minute_bucket = 0`,
        [userId, dateStr, safeReserveTokens],
      );
      await client.query(
        `UPDATE usage_quotas
         SET requests_count = requests_count + 1, updated_at = NOW()
         WHERE user_id = $1 AND date = $2::date AND minute_bucket = $3`,
        [userId, dateStr, minuteBucket],
      );
      await client.query(
        `UPDATE ai_global_daily_budgets
         SET reserved_tokens = reserved_tokens + $2,
             requests_count = requests_count + 1,
             updated_at = NOW()
         WHERE date = $1::date`,
        [dateStr, safeReserveTokens],
      );
      await client.query(
        `INSERT INTO ai_token_reservations (
           id, request_id, user_id, usage_date, provider, model, credential_origin,
           reserved_tokens, usage_source, status, expires_at
         ) VALUES (
           $1, $2, $3, $4::date, $5, $6, 'shared',
           $7, 'reserved', 'reserved', NOW() + ($8::bigint * INTERVAL '1 millisecond')
         )`,
        [
          reservationId,
          effectiveRequestId,
          userId,
          dateStr,
          options.provider,
          options.model ?? null,
          safeReserveTokens,
          limits.reservationTtlMs,
        ],
      );

      return decision(dailyUsed + 1, minuteUsed + 1, {
        tokensUsed: userTokensUsed,
        tokensReserved: userTokensReserved + safeReserveTokens,
        reservationId,
        reservedTokens: safeReserveTokens,
      });
    });
  },

  /**
   * Reconcilia idempotentemente uma reserva com o uso real reportado pelo provedor
   * (ou política conservadora em caso de ausência de métricas, falha ou cancelamento).
   */
  async reconcileReservation(
    reservationId: string,
    settlement: AIUsageSettlement,
    options?: { inputEstimate?: number },
  ): Promise<ReconcileResult> {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      const res = localReservations.get(reservationId);
      if (!res || (res.status !== "reserved" && res.status !== "expired")) {
        return { reconciled: false, alreadySettled: true, chargedTokens: 0, releasedTokens: 0, usageSource: "unknown", status: "reconciled" };
      }
      const wasReserved = res.status === "reserved";
      const resolved = resolveSettlementCharge(res.reservedTokens, settlement, options?.inputEstimate);
      res.status = resolved.status;
      res.usageSource = resolved.usageSource;
      res.actualInputTokens = resolved.inputTokens ?? undefined;
      res.actualOutputTokens = resolved.outputTokens ?? undefined;
      res.actualTotalTokens = resolved.chargedTokens;
      if (settlement.model) res.model = settlement.model;

      const userCounter = localQuota.get(res.userId);
      if (userCounter && userCounter.date === res.usageDate) {
        if (wasReserved) {
          userCounter.tokensReserved = Math.max(0, userCounter.tokensReserved - res.reservedTokens);
        }
        userCounter.tokensUsed += resolved.chargedTokens;
      }
      const globalBudget = getLocalGlobalBudget(res.usageDate);
      if (wasReserved) {
        globalBudget.reservedTokens = Math.max(0, globalBudget.reservedTokens - res.reservedTokens);
      }
      globalBudget.consumedTokens += resolved.chargedTokens;
      return {
        reconciled: true,
        chargedTokens: resolved.chargedTokens,
        releasedTokens: wasReserved ? Math.max(0, res.reservedTokens - resolved.chargedTokens) : 0,
        usageSource: resolved.usageSource,
        status: resolved.status,
      };
    }

    return transaction(async (client) => {
      const locked = await client.query<{
        id: string;
        user_id: string;
        usage_date: string;
        reserved_tokens: string;
        status: string;
      }>(
        "SELECT id, user_id, usage_date::text AS usage_date, reserved_tokens::text, status FROM ai_token_reservations WHERE id = $1 FOR UPDATE",
        [reservationId],
      );
      const row = locked.rows[0];
      if (!row || (row.status !== "reserved" && row.status !== "expired")) {
        return { reconciled: false, alreadySettled: true, chargedTokens: 0, releasedTokens: 0, usageSource: "unknown", status: "reconciled" };
      }

      const wasReserved = row.status === "reserved";
      const reservedTokens = Number(row.reserved_tokens);
      const releaseFromReserved = wasReserved ? reservedTokens : 0;
      const resolved = resolveSettlementCharge(reservedTokens, settlement, options?.inputEstimate);

      await client.query(
        `UPDATE ai_token_reservations
         SET status = $2,
             actual_input_tokens = $3,
             actual_output_tokens = $4,
             actual_total_tokens = $5,
             usage_source = $6,
             model = COALESCE($7, model),
             reconciled_at = NOW()
         WHERE id = $1 AND status IN ('reserved', 'expired')`,
        [
          reservationId,
          resolved.status,
          resolved.inputTokens,
          resolved.outputTokens,
          resolved.chargedTokens,
          resolved.usageSource,
          settlement.model ?? null,
        ],
      );

      await client.query(
        `UPDATE usage_quotas
         SET reserved_tokens = GREATEST(0, reserved_tokens - $3),
             tokens_count = tokens_count + $4,
             updated_at = NOW()
         WHERE user_id = $1 AND date = $2::date AND minute_bucket = 0`,
        [row.user_id, row.usage_date, releaseFromReserved, resolved.chargedTokens],
      );

      await client.query(
        `UPDATE ai_global_daily_budgets
         SET reserved_tokens = GREATEST(0, reserved_tokens - $2),
             consumed_tokens = consumed_tokens + $3,
             updated_at = NOW()
         WHERE date = $1::date`,
        [row.usage_date, releaseFromReserved, resolved.chargedTokens],
      );

      return {
        reconciled: true,
        chargedTokens: resolved.chargedTokens,
        releasedTokens: wasReserved ? Math.max(0, reservedTokens - resolved.chargedTokens) : 0,
        usageSource: resolved.usageSource,
        status: resolved.status,
      };
    });
  },

  /**
   * Mantido para compatibilidade com chamadores existentes (ex.: testes legados de cota por requisição).
   * Para requisições completas de IA, prefira `reserveSharedBudget` + `reconcileReservation`.
   */
  async checkAndConsume(
    userId: string,
    options: {
      provider: string;
      tokens?: number;
      useSharedKeys: boolean;
    },
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
    const tokensIncrement = typeof options.tokens === "number" && Number.isFinite(options.tokens) && options.tokens > 0
      ? Math.trunc(options.tokens)
      : 0;
    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      if (process.env.NODE_ENV === "production") {
        throw Object.assign(new Error("Armazenamento de quota indisponível."), { code: "QUOTA_STORAGE_UNAVAILABLE" });
      }
      const minuteBucket = getMinuteBucket();
      const current = localQuota.get(userId);
      const dailyUsed = current?.date === dateStr ? current.dailyUsed + 1 : 1;
      const minuteUsed = current?.date === dateStr && current.minuteBucket === minuteBucket ? current.minuteUsed + 1 : 1;
      const tokensUsed = (current?.date === dateStr ? current.tokensUsed : 0) + tokensIncrement;
      const tokensReserved = current?.date === dateStr ? current.tokensReserved : 0;
      localQuota.set(userId, { date: dateStr, minuteBucket, dailyUsed, minuteUsed, tokensUsed, tokensReserved });
      return decision(dailyUsed, minuteUsed, { tokensUsed, tokensReserved });
    }

    const dailyResult = await query(
      `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
       VALUES ($1, $2, 0, 1, COALESCE($3, 0))
       ON CONFLICT (user_id, date, minute_bucket)
       DO UPDATE SET requests_count = usage_quotas.requests_count + 1, tokens_count = usage_quotas.tokens_count + COALESCE($3, 0), updated_at = NOW()
       RETURNING requests_count, tokens_count, reserved_tokens`,
      [userId, dateStr, tokensIncrement],
    );

    const minuteResult = await query(
      `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
       VALUES ($1, $2, $3, 1, COALESCE($4, 0))
       ON CONFLICT (user_id, date, minute_bucket)
       DO UPDATE SET requests_count = usage_quotas.requests_count + 1, tokens_count = usage_quotas.tokens_count + COALESCE($4, 0), updated_at = NOW()
       RETURNING requests_count, tokens_count`,
      [userId, dateStr, getMinuteBucket(), tokensIncrement],
    );

    const dailyUsed = Number(dailyResult.rows[0]?.requests_count ?? 1);
    const minuteUsed = Number(minuteResult.rows[0]?.requests_count ?? 1);
    const tokensUsed = Number(dailyResult.rows[0]?.tokens_count ?? 0);
    const tokensReserved = Number(dailyResult.rows[0]?.reserved_tokens ?? 0);
    return decision(dailyUsed, minuteUsed, { tokensUsed, tokensReserved });
  },

  async isSharedAIAvailable(): Promise<boolean> {
    const limits = getQuotaLimitsConfig();
    const dateStr = getDateString();
    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      reclaimExpiredLocalReservations(dateStr);
      const globalBudget = getLocalGlobalBudget(dateStr);
      return (globalBudget.consumedTokens + globalBudget.reservedTokens) < limits.globalDailyTokenBudget;
    }
    try {
      const res = await query<{ reserved_tokens: string; consumed_tokens: string }>(
        "SELECT reserved_tokens::text, consumed_tokens::text FROM ai_global_daily_budgets WHERE date = $1::date",
        [dateStr],
      );
      const row = res.rows[0];
      if (!row) return true;
      return (Number(row.reserved_tokens) + Number(row.consumed_tokens)) < limits.globalDailyTokenBudget;
    } catch {
      return false;
    }
  },

  async getQuotaInfo(userId: string) {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) {
      if (process.env.NODE_ENV === "production") {
        throw Object.assign(new Error("Armazenamento de quota indisponível."), { code: "QUOTA_STORAGE_UNAVAILABLE" });
      }
      const date = getDateString();
      reclaimExpiredLocalReservations(date);
      const current = localQuota.get(userId);
      const minuteBucket = getMinuteBucket();
      return quotaInfo(
        current?.date === date ? current.dailyUsed : 0,
        current?.date === date && current.minuteBucket === minuteBucket ? current.minuteUsed : 0,
        Boolean(current?.date === date && current.dailyUsed > 0),
        current?.date === date ? current.tokensUsed : 0,
        current?.date === date ? current.tokensReserved : 0,
      );
    }

    const dateStr = getDateString();
    const [dailyResult, minuteResult] = await Promise.all([
      query(
        "SELECT COALESCE(requests_count, 0) as used, COALESCE(tokens_count, 0) as tokens_used, COALESCE(reserved_tokens, 0) as tokens_reserved FROM usage_quotas WHERE user_id = $1 AND date = $2 AND minute_bucket = 0",
        [userId, dateStr],
      ),
      query(
        "SELECT COALESCE(SUM(requests_count), 0) as used FROM usage_quotas WHERE user_id = $1 AND date = $2 AND minute_bucket = $3",
        [userId, dateStr, getMinuteBucket()],
      ),
    ]);

    const dailyUsed = Number(dailyResult.rows[0]?.used ?? 0);
    const minuteUsed = Number(minuteResult.rows[0]?.used ?? 0);
    const tokensUsed = Number(dailyResult.rows[0]?.tokens_used ?? 0);
    const tokensReserved = Number(dailyResult.rows[0]?.tokens_reserved ?? 0);

    return quotaInfo(dailyUsed, minuteUsed, dailyUsed > 0 || minuteUsed > 0, tokensUsed, tokensReserved);
  },

  async getUsageStats(userId: string, days = 30) {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) return [];

    const safeDays = Math.min(365, Math.max(1, Math.trunc(days)));
    const result = await query(
      `SELECT date, requests_count as requests, tokens_count as tokens
       FROM usage_quotas
       WHERE user_id = $1 AND minute_bucket = 0 AND date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
       ORDER BY date DESC`,
      [userId, safeDays],
    );

    return result.rows.map((row) => ({
      date: row.date,
      requests: Number(row.requests),
      tokens: Number(row.tokens),
    }));
  },

  /**
   * Remove baldes por minuto expirados (`minute_bucket > 0`), reclama reservas de
   * tokens/armazenamento abandonadas e remove histórico antigo de reservas em lotes.
   */
  async cleanupExpired(
    retainMinuteDays = 7,
    options?: { batchLimit?: number; client?: PoolClient },
  ): Promise<number> {
    const hasPg = await hasPostgresAsync();
    if (!hasPg) return 0;

    const safeDays = Math.min(365, Math.max(2, Math.trunc(retainMinuteDays)));
    const requestedBatch = Number.isFinite(options?.batchLimit)
      ? Math.trunc(options!.batchLimit!)
      : DEFAULT_QUOTA_CLEANUP_BATCH_LIMIT;
    const safeBatchLimit = Math.min(MAX_QUOTA_CLEANUP_BATCH_LIMIT, Math.max(100, requestedBatch));
    try {
      const exec = (sql: string, params: unknown[]) =>
        options?.client ? options.client.query(sql, params) : query(sql, params);

      // 1) Reclamar reservas de IA expiradas (quando disponível client transacional)
      if (options?.client) {
        await reclaimExpiredPostgresReservations(options.client, safeBatchLimit).catch(() => 0);
      } else if (typeof transaction === "function") {
        await transaction((client) => reclaimExpiredPostgresReservations(client, safeBatchLimit)).catch(() => 0);
      }

      // 2) Expirar reservas de armazenamento abandonadas + remover histórico antigo (>7 dias)
      await exec(
        `UPDATE storage_reservations
         SET status = 'expired', updated_at = NOW()
         WHERE id IN (
           SELECT id FROM storage_reservations
           WHERE status = 'reserved' AND expires_at <= NOW()
           LIMIT $1
         )`,
        [safeBatchLimit],
      ).catch(() => undefined);

      await exec(
        `DELETE FROM storage_reservations
         WHERE ctid IN (
           SELECT ctid FROM storage_reservations
           WHERE status <> 'reserved' AND updated_at < NOW() - INTERVAL '7 days'
           LIMIT $1
         )`,
        [safeBatchLimit],
      ).catch(() => undefined);

      // 3) Remover histórico antigo de reservas de IA (>30 dias)
      await exec(
        `DELETE FROM ai_token_reservations
         WHERE ctid IN (
           SELECT ctid FROM ai_token_reservations
           WHERE status <> 'reserved' AND created_at < NOW() - ($1::int * INTERVAL '1 day')
           LIMIT $2
         )`,
        [RESERVATION_HISTORY_RETAIN_DAYS, safeBatchLimit],
      ).catch(() => undefined);

      // 4) Remover baldes por minuto expirados em usage_quotas (preservando minute_bucket = 0)
      const result = await exec(
        `DELETE FROM usage_quotas
         WHERE ctid IN (
           SELECT ctid FROM usage_quotas
           WHERE minute_bucket > 0
             AND date < CURRENT_DATE - ($1::int * INTERVAL '1 day')
           LIMIT $2
         )`,
        [safeDays, safeBatchLimit],
      );
      return result.rowCount ?? 0;
    } catch {
      return 0;
    }
  },
};
