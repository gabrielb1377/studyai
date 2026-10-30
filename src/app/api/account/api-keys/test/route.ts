import { NextResponse } from "next/server";

import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { ProviderRegistry } from "@/features/ai/ProviderRegistry";
import { isAIProviderId } from "@/features/ai/AIProvider";
import { rateLimitRejection } from "@/server/security/RateLimitHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    const limit = await ApiKeyService.rateLimitTest(user.sub);
    if (!limit.allowed) {
      return rateLimitRejection(limit, "Muitas tentativas. Tente novamente em instantes.");
    }
    const body = await jsonBody<{ provider?: string; key?: string }>(request);
    if (!isAIProviderId(body.provider)) throw new Error("Provider de IA inválido.");
    const key = typeof body.key === "string" && body.key.trim().length > 0
      ? body.key.trim()
      : await ApiKeyService.getDecrypted(user.sub, body.provider);
    if (!key) throw new Error("Informe a chave de API.");
    const provider = ProviderRegistry.get(body.provider);
    const status = await provider.inspect?.(request.signal, key);
    return NextResponse.json(status ?? { provider: body.provider, available: false, error: "Provider não suporta inspeção." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}