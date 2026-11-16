import { NextResponse } from "next/server";
import { normalizeAIError } from "@/features/ai/AIErrors";
import {
  isAIModelPreferences,
  isAIProviderId,
  isAISelectionMode,
  type AIModelPreferences,
  type AIProviderId,
  type AISelectionMode,
} from "@/features/ai/AIProvider";
import { LabChallengeHttpError, LabChallengeService, verifyChallengeOwnership } from "@/features/lab/services/LabChallengeService";
import { isLabChallengeRequest } from "@/features/lab/validators/lab-validation";
import { withAIQuota } from "@/server/ai/QuotaMiddleware";
import { apiError, requireActiveSession, requireCsrf, requireSessionOwner, requireUser } from "@/server/auth/http";

export const runtime = "nodejs";

type Body = {
  request?: unknown;
  provider?: AIProviderId;
  model?: string;
  models?: AIModelPreferences;
  mode?: AISelectionMode;
};

const RATE_LIMIT_RETRY_AFTER_SECONDS = 30;

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    if (request.headers.has("x-studyai-session-user")) {
      requireSessionOwner(request, user.sub);
    }

    const previewBody = (await request.clone().json().catch(() => null)) as Body | null;
    if (
      !previewBody ||
      !isLabChallengeRequest(previewBody.request) ||
      (previewBody.provider !== undefined && !isAIProviderId(previewBody.provider)) ||
      (previewBody.mode !== undefined && !isAISelectionMode(previewBody.mode)) ||
      !isAIModelPreferences(previewBody.models) ||
      (previewBody.model !== undefined && (typeof previewBody.model !== "string" || !previewBody.model.trim()))
    ) {
      return NextResponse.json(
        {
          code: "INVALID_CHALLENGE_REQUEST",
          error: "Selecione um material com texto extraído válido e uma modalidade suportada.",
        },
        { status: 400 },
      );
    }

    try {
      await verifyChallengeOwnership(user.sub, previewBody.request);
    } catch (ownershipError) {
      if (ownershipError instanceof LabChallengeHttpError) {
        return NextResponse.json({ code: ownershipError.code, error: ownershipError.message }, { status: ownershipError.status });
      }
      throw ownershipError;
    }

    return withAIQuota(
      request,
      async (scopedRequest, aiRequest) => {
        try {
          const challenge = await LabChallengeService.generate({
            userId: user.sub,
            request: previewBody.request as Parameters<typeof LabChallengeService.generate>[0]["request"],
            provider: previewBody.provider,
            model: previewBody.model,
            models: previewBody.models,
            mode: previewBody.mode,
            signal: scopedRequest.signal,
            apiKeys: aiRequest.apiKeys as Partial<Record<AIProviderId, string>> | undefined,
          });
          return NextResponse.json({ challenge });
        } catch (error) {
          if (error instanceof LabChallengeHttpError) {
            return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
          }
          const normalized = normalizeAIError(error, "Não foi possível gerar o desafio prático com IA.");
          const response = NextResponse.json(normalized.body, { status: normalized.status });
          if (normalized.status === 429) {
            response.headers.set("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
          }
          return response;
        }
      },
      { history: [], message: "Gerar desafio prático no laboratório." },
    );
  } catch (error) {
    return apiError(error);
  }
}
