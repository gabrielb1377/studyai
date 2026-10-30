import { NextResponse } from "next/server";

import { AIService } from "@/features/ai/AIService";
import { isAIProviderId } from "@/features/ai/AIProvider";
import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { AuthService } from "@/server/auth/AuthService";
import { readCookie } from "@/server/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { provider } = await params;
  if (!isAIProviderId(provider)) {
    return NextResponse.json({ error: "Provider de IA inválido." }, { status: 400 });
  }

  const url = new URL(request.url);
  const user = AuthService.access(readCookie(request, "access"));
  let apiKey: string | undefined;
  if (user) {
    try { apiKey = await ApiKeyService.getDecrypted(user.sub, provider); }
    catch { return NextResponse.json({ provider, available: false, models: [], latencyMs: 0, error: "Não foi possível ler a chave salva." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  }
  const status = await AIService.inspect(provider, {
    force: url.searchParams.get("refresh") === "true",
    signal: request.signal,
    apiKey,
  });
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
