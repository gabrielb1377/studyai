import { NextResponse } from "next/server";
import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { aiProviderIds, type AIProviderId } from "@/features/ai/AIProvider";
import { DiagramAssistService } from "@/features/diagrams/DiagramAssistService";
import { DIAGRAM_LIMITS, normalizeText } from "@/features/diagrams/limits";
import { diagramTypes, type DiagramType } from "@/features/diagrams/types";
import { withAIQuota, createQuotaAwareAIRequest } from "@/server/ai/QuotaMiddleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAIQuota(request, async (request, aiRequest) => {
    try {
      if ((request.headers.get("cookie") ?? "").includes("studyai_csrf=")) requireCsrf(request);

      const body = await jsonBody<{ topic?: string; type?: string; context?: string }>(request);
      const topic = normalizeText(body.topic ?? "", DIAGRAM_LIMITS.maxAiTopicLength);
      if (!topic) throw new Error("Descreva o tema do diagrama antes de gerar.");

      const type = diagramTypes.includes(body.type as DiagramType) ? (body.type as DiagramType) : "flowchart";

      const result = await DiagramAssistService.generate({
        topic,
        type,
        context: normalizeText(body.context ?? "", 2_000),
        apiKeys: aiRequest.apiKeys as Partial<Record<AIProviderId, string>> | undefined,
      });

      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return apiError(error);
    }
  });
}
