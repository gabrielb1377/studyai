import "server-only";

import { RateLimitService, type RateLimitStatus } from "./RateLimitService";

const buckets = new Map<string, { count: number; resetAt: number }>();

export type RateLimitDecision = RateLimitStatus & {
  /** `true` quando o backend persistente está indisponível e a política é negar. */
  unavailable?: true;
};

function inMemoryRateLimit(key: string, limit = 20, windowMs = 60_000): RateLimitDecision {
  const timestamp = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= timestamp) {
    const resetAt = timestamp + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, limit, resetAt: new Date(resetAt).toISOString() };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt: new Date(bucket.resetAt).toISOString(),
    retryAfter: Math.ceil((bucket.resetAt - timestamp) / 1000),
  };
}

export async function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  try {
    return await RateLimitService.checkAndConsume(key, { limit, windowMs });
  } catch {
    // Fail-open deliberado apenas para endpoints não críticos (sync,
    // colaboração, telemetria, feedback). O fallback em memória é local à
    // instância e não substitui a proteção distribuída.
    return inMemoryRateLimit(key, limit, windowMs);
  }
}

/**
 * Rate limit para endpoints críticos de segurança (login, cadastro,
 * recuperação de senha e gerenciamento de API keys).
 *
 * Em produção, se o backend persistente estiver indisponível, a requisição é
 * negada (503) em vez de cair no contador em memória — que permitiria bypass
 * distribuído durante uma indisponibilidade do PostgreSQL.
 *
 * Em desenvolvimento sem DATABASE_URL o comportamento é preservado (o próprio
 * `RateLimitService` libera a requisição); com DATABASE_URL configurada e
 * falha de conexão, usa-se o fallback em memória local explicitamente.
 */
export async function rateLimitStrict(
  key: string,
  limit = 20,
  windowMs = 60_000
): Promise<RateLimitDecision> {
  try {
    return await RateLimitService.checkAndConsume(key, { limit, windowMs });
  } catch {
    if (process.env.NODE_ENV === "production") {
      return {
        allowed: false,
        remaining: 0,
        limit,
        resetAt: new Date(Date.now() + windowMs).toISOString(),
        retryAfter: Math.ceil(windowMs / 1000),
        unavailable: true,
      };
    }
    return inMemoryRateLimit(key, limit, windowMs);
  }
}

export function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}