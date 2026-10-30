import { NextResponse } from "next/server";

import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { aiProviderIds, type AIProviderId } from "@/features/ai/AIProvider";
import { StudioAssistService, type StudioAssistAction } from "@/features/academy/studio/StudioAssistService";
import { clampText } from "@/features/academy/studio/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS: StudioAssistAction[] = [
  "improve-writing",
  "summarize",
  "expand",
  "simplify",
  "create-example",
  "create-exercise",
  "reorganize",
];

export async function POST(request: Request) {
  try {
    // Usuários autenticados enviam o token de CSRF; o modo visitante não possui cookie de sessão.
    if ((request.headers.get("cookie") ?? "").includes("studyai_csrf=")) requireCsrf(request);

    const body = await jsonBody<{ action?: string; text?: string; context?: string }>(request);

    if (!body.action || !ALLOWED_ACTIONS.includes(body.action as StudioAssistAction)) {
      throw new Error("Ação de assistência inválida.");
    }
    const text = clampText(body.text ?? "", 20_000);
    if (!text.trim()) throw new Error("Selecione um texto antes de pedir assistência.");

    // Prioriza a chave individual (BYOK) do usuário; sem sessão, usa a chave do servidor.
    let apiKeys: Partial<Record<AIProviderId, string>> | undefined;
    try {
      const user = requireUser(request);
      const entries = await Promise.all(
        aiProviderIds.map(async (provider) => [provider, await ApiKeyService.getDecrypted(user.sub, provider)] as const),
      );
      const map: Partial<Record<AIProviderId, string>> = {};
      for (const [provider, key] of entries) if (key) map[provider] = key;
      if (Object.keys(map).length > 0) apiKeys = map;
    } catch {
      apiKeys = undefined;
    }

    const result = await StudioAssistService.assist({
      action: body.action as StudioAssistAction,
      text,
      context: clampText(body.context ?? "", 2_000),
      apiKeys,
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
