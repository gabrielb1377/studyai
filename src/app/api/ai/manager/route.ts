import { NextResponse } from "next/server";

import { AIService } from "@/features/ai/AIService";
import { aiProviderIds, type AIProviderId } from "@/features/ai/AIProvider";
import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { apiError, requireUser } from "@/server/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const user = requireUser(request);
    const apiKeys: Partial<Record<AIProviderId, string>> = {};
    const unreadable = new Set<AIProviderId>();
    await Promise.all(aiProviderIds.map(async (provider) => {
      try { apiKeys[provider] = await ApiKeyService.getDecrypted(user.sub, provider); }
      catch { unreadable.add(provider); }
    }));
    const status = await AIService.status({
      force: url.searchParams.get("refresh") === "true",
      signal: request.signal,
      apiKeys,
    });
    return NextResponse.json({ ...status, providers: status.providers.map((item) => unreadable.has(item.provider) ? { ...item, available: false, models: [], error: "Não foi possível ler a chave salva." } : item) }, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    return apiError(error);
  }
}
