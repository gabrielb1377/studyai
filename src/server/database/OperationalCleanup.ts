import "server-only";

import { QuotaService } from "@/server/ai/QuotaService";
import { hasPostgres, transaction } from "@/server/database/Postgres";
import {
  DEFAULT_CLEANUP_BATCH_LIMIT,
  MAX_CLEANUP_BATCH_LIMIT,
  RateLimitService,
} from "@/server/security/RateLimitService";

// Par estável de inteiros de 32 bits para pg_try_advisory_xact_lock (exclusividade multi-instância).
export const OPERATIONAL_CLEANUP_LOCK_CLASS_ID = 71029481;
export const OPERATIONAL_CLEANUP_LOCK_OBJECT_ID = 2026;

export type OperationalCleanupResult = {
  executed: boolean;
  rateLimitsRemoved: number;
  quotaMinuteBucketsRemoved: number;
  skippedReason?: "postgres_unavailable" | "already_running";
  batchLimit?: number;
  durationMs?: number;
};

function normalizeBatchLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_CLEANUP_BATCH_LIMIT;
  return Math.min(MAX_CLEANUP_BATCH_LIMIT, Math.max(100, Math.trunc(value!)));
}

/**
 * Executa limpeza idempotente apenas de registros operacionais expirados
 * (`rate_limits` acima da janela ativa e baldes por minuto expirados em `usage_quotas`),
 * preservando registros ativos, históricos diários (minute_bucket = 0) e sessões válidas.
 *
 * Protegido contra execuções concorrentes em múltiplas instâncias por
 * `pg_try_advisory_xact_lock` e limitado por lote (`batchLimit`).
 */
export const OperationalCleanup = {
  async run(options: {
    rateLimitMaxAgeMs?: number;
    quotaMinuteRetainDays?: number;
    batchLimit?: number;
  } = {}): Promise<OperationalCleanupResult> {
    if (!(await hasPostgres({ allowMissing: true }))) {
      return {
        executed: false,
        rateLimitsRemoved: 0,
        quotaMinuteBucketsRemoved: 0,
        skippedReason: "postgres_unavailable",
      };
    }

    const batchLimit = normalizeBatchLimit(options.batchLimit);
    const startedAt = performance.now();

    return transaction(async (client) => {
      const lockResult = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock($1, $2) AS locked",
        [OPERATIONAL_CLEANUP_LOCK_CLASS_ID, OPERATIONAL_CLEANUP_LOCK_OBJECT_ID],
      );
      if (!lockResult.rows[0]?.locked) {
        return {
          executed: false,
          rateLimitsRemoved: 0,
          quotaMinuteBucketsRemoved: 0,
          skippedReason: "already_running" as const,
          batchLimit,
          durationMs: Math.round(performance.now() - startedAt),
        };
      }

      const rateLimitsRemoved = await RateLimitService.cleanup(options.rateLimitMaxAgeMs, {
        batchLimit,
        client,
      });
      const quotaMinuteBucketsRemoved = await QuotaService.cleanupExpired(options.quotaMinuteRetainDays, {
        batchLimit,
        client,
      });
      const durationMs = Math.round(performance.now() - startedAt);

      console.info("[OperationalCleanup] Executed", {
        rateLimitsRemoved,
        quotaMinuteBucketsRemoved,
        batchLimit,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      return {
        executed: true,
        rateLimitsRemoved,
        quotaMinuteBucketsRemoved,
        batchLimit,
        durationMs,
      };
    });
  },
};
