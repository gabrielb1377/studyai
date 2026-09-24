import "server-only";
import { NextResponse } from "next/server";
import { rateLimit } from "@/server/security/RateLimit";

export function collaborationRateLimit(userId: string) {
  const result = rateLimit(`collaboration:${userId}`, 120, 60_000);
  if (!result.allowed) throw new Response(JSON.stringify({ error: "Muitas alterações em pouco tempo. Tente novamente em instantes." }), { status: 429, headers: { "content-type": "application/json", "retry-after": String(result.retryAfter ?? 60) } });
}

export function collaborationError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Não foi possível concluir a ação colaborativa.";
  const status = message === "VERSION_CONFLICT" ? 409 : message === "RESOURCE_NOT_FOUND" ? 404 : 400;
  return NextResponse.json({ error: message === "VERSION_CONFLICT" ? "Este conteúdo foi atualizado por outra pessoa. Recarregue antes de salvar." : message === "RESOURCE_NOT_FOUND" ? "Recurso não encontrado." : message }, { status });
}
