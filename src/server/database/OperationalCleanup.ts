import "server-only";

import { QuotaService } from "@/server/ai/QuotaService";
import { hasPostgres } from "@/server/database/Postgres";
import { RateLimitService } from "@/server/security/RateLimitService";

export type OperationalCleanupResult = {
  executed: boolean;
  rateLimitsRemoved: number;
  quotaMinuteBucketsRemoved: number;
};

/**
 * Executa limpeza idempotente apenas de registros operacionais expirados
 * (`rate_limits` acima da janela ativa e baldes por minuto expirados em `usage_quotas`),
 * preservando registros ativos, históricos diários (minute_bucket = 0) e sessões válidas.
 */
export const OperationalCleanup = {
  async run(options: {
    rateLimitMaxAgeMs?: number;
    quotaMinuteRetainDays?: number;
  } = {}): Promise<OperationalCleanupResult> {
    if (!(await hasPostgres())) {
      return {
        executed: false,
        rateLimitsRemoved: 0,
        quotaMinuteBucketsRemoved: 0,
      };
    }

    const [rateLimitsRemoved, quotaMinuteBucketsRemoved] = await Promise.all([
      RateLimitService.cleanup(options.rateLimitMaxAgeMs),
      QuotaService.cleanupExpired(options.quotaMinuteRetainDays),
    ]);

    return {
      executed: true,
      rateLimitsRemoved,
      quotaMinuteBucketsRemoved,
    };
  },
};
