import { NextResponse } from "next/server";

import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { aiProviderIds, type AIProviderId } from "@/features/ai/AIProvider";
import { DiagramAssistService } from "@/features/diagrams/DiagramAssistService";
import { DIAGRAM_LIMITS, normalizeText } from "@/features/diagrams/limits";
import { diagramTypes, type DiagramType } from "@/features/diagrams/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if ((request.headers.get("cookie") ?? "").includes("studyai_csrf=")) requireCsrf(request);

    const body = await jsonBody<{ topic?: string; type?: string; context?: string }>(request);
    const topic = normalizeText(body.topic ?? "", DIAGRAM_LIMITS.maxAiTopicLength);
    if (!topic) throw new Error("Descreva o tema do diagrama antes de gerar.");

    const type = diagramTypes.includes(body.type as DiagramType) ? (body.type as DiagramType) : "flowchart";

    // Prioriza a chave individual (BYOK); sem sessão, usa a configuração do servidor.
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

    const result = await DiagramAssistService.generate({
      topic,
      type,
      context: normalizeText(body.context ?? "", 2_000),
      apiKeys,
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
