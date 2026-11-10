import { NextResponse } from "next/server";

import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { StudioAssistService, type StudioAssistAction } from "@/features/academy/studio/StudioAssistService";
import { clampText } from "@/features/academy/studio/sanitize";
import { withAIQuota } from "@/server/ai/QuotaMiddleware";

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
    requireCsrf(request);
    requireUser(request);

    const body = await jsonBody<{ action?: string; text?: string; context?: string }>(request.clone(), 32 * 1024);

    if (!body.action || !ALLOWED_ACTIONS.includes(body.action as StudioAssistAction)) {
      throw new Error("Ação de assistência inválida.");
    }
    const text = clampText(body.text ?? "", 20_000);
    if (!text.trim()) throw new Error("Selecione um texto antes de pedir assistência.");

    const input = {
      action: body.action as StudioAssistAction,
      text,
      context: clampText(body.context ?? "", 2_000),
    };
    return withAIQuota(
      request,
      async (_request, aiRequest) => NextResponse.json(
        await StudioAssistService.assist(input, aiRequest),
        { headers: { "Cache-Control": "no-store" } },
      ),
      { history: [], message: StudioAssistService.prompt(input) },
    );
  } catch (error) {
    return apiError(error);
  }
}
