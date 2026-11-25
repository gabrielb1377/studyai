import "server-only";

import { NextResponse } from "next/server";

import type { RateLimitDecision } from "./RateLimit";

/**
 * Resposta padronizada para rate limit.
 *
 * - 429: limite excedido com o backend persistente saudável.
 * - 503: backend persistente indisponível em produção (fail-closed).
 *   Nunca expõe detalhes internos do banco.
 */
export function rateLimitRejection(limit: RateLimitDecision, message: string) {
  if (limit.unavailable) {
    return NextResponse.json(
      { error: "Serviço temporariamente indisponível. Tente novamente em instantes." },
      { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json({ error: message }, { status: 429 });
}
