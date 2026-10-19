import { NextResponse } from "next/server";

import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { isAIProviderId } from "@/features/ai/AIProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    const keys = await ApiKeyService.list(user.sub);
    return NextResponse.json({ keys }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    const body = await jsonBody<{ provider?: string; key?: string }>(request);
    if (!isAIProviderId(body.provider)) throw new Error("Provider de IA inválido.");
    if (typeof body.key !== "string" || body.key.trim().length === 0) throw new Error("Informe a chave de API.");
    const limit = ApiKeyService.rateLimitSet(user.sub);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Muitas tentativas. Tente novamente em instantes." }, { status: 429 });
    }
    await ApiKeyService.set(user.sub, body.provider, body.key);
    return NextResponse.json({ ok: true, provider: body.provider }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");
    if (!isAIProviderId(provider)) throw new Error("Provider de IA inválido.");
    await ApiKeyService.delete(user.sub, provider);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}