import { NextResponse } from "next/server";

import { AIError, normalizeAIError } from "@/features/ai/AIErrors";
import {
  isAIModelPreferences,
  isAIProviderId,
  isAISelectionMode,
  type AIModelPreferences,
  type AIProviderId,
  type AISelectionMode,
} from "@/features/ai/AIProvider";
import { AIService } from "@/features/ai/AIService";
import { TokenCounter } from "@/features/ai/TokenCounter";
import { AcademyPromptBuilder } from "@/features/academy/services/AcademyPromptBuilder";
import {
  academyContentKinds,
  academyGenerationStages,
  academyGenerationModes,
  academyDepths,
  academyGoals,
  academyLanguages,
  academyLevels,
  academyStyles,
  type AcademyContentKind,
  type AcademyGenerationMode,
  type AcademyGenerationStage,
  type AcademyStudy,
} from "@/features/academy/types";
import { AcademyGenerationParser } from "@/features/academy/validation/generation-parser";

export const runtime = "nodejs";

type AcademyGenerateRequest = {
  study: AcademyStudy;
  kind: AcademyContentKind;
  generationMode: AcademyGenerationMode;
  stage: AcademyGenerationStage;
  previous?: unknown;
  model?: string;
  models?: AIModelPreferences;
  mode?: AISelectionMode;
  provider?: AIProviderId;
};

function isStudy(value: unknown): value is AcademyStudy {
  if (!value || typeof value !== "object") return false;
  const study = value as Partial<AcademyStudy>;
  return typeof study.id === "string" && study.id.length <= 120 &&
    typeof study.topic === "string" && study.topic.trim().length > 0 && study.topic.length <= 160 &&
    typeof study.subject === "string" && study.subject.trim().length > 0 && study.subject.length <= 160 &&
    typeof study.duration === "number" && study.duration >= 5 && study.duration <= 10_000 &&
    academyLevels.includes(study.level as typeof academyLevels[number]) &&
    academyGoals.includes(study.goal as typeof academyGoals[number]) &&
    academyLanguages.includes(study.language as typeof academyLanguages[number]) &&
    academyDepths.includes(study.depth as typeof academyDepths[number]) &&
    academyStyles.includes(study.style as typeof academyStyles[number]);
}

function isRequest(value: unknown): value is AcademyGenerateRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<AcademyGenerateRequest>;
  return isStudy(body.study) &&
    academyContentKinds.includes(body.kind as AcademyContentKind) &&
    academyGenerationModes.includes(body.generationMode as AcademyGenerationMode) &&
    academyGenerationStages.includes(body.stage as AcademyGenerationStage) &&
    (body.provider === undefined || isAIProviderId(body.provider)) &&
    (body.mode === undefined || isAISelectionMode(body.mode)) &&
    (body.model === undefined || (typeof body.model === "string" && body.model.trim().length > 0)) &&
    isAIModelPreferences(body.models);
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRequest(body)) {
    return NextResponse.json({ error: "Os dados para gerar o conteúdo são inválidos." }, { status: 400 });
  }

  try {
    const prompt = AcademyPromptBuilder.build(body);
    if (prompt.metrics.promptTokens > 8_000) {
      return NextResponse.json({ error: "O contexto excedeu o limite seguro. Reduza a profundidade ou a duração." }, { status: 413 });
    }
    const response = await AIService.generate({
      history: prompt.history,
      message: prompt.message,
      signal: request.signal,
      model: body.model,
      models: body.models,
      mode: body.mode,
      provider: body.provider,
      maxOutputTokens: body.stage === "outline" ? 2_048 : body.stage === "lessons" ? 8_192 : 4_096,
      timeoutMs: 90_000,
    });
    const data = AcademyGenerationParser.parse(body.stage, response.text);
    return NextResponse.json({
      stage: body.stage,
      data,
      provider: response.provider,
      model: response.model,
      usage: response.usage ?? { inputTokens: TokenCounter.estimate(prompt.message) },
      cached: response.execution?.cached ?? false,
    });
  } catch (error) {
    const normalized = normalizeAIError(
      error instanceof AIError
        ? error
        : new AIError(
          error instanceof Error ? error.message : "O provider retornou uma resposta inválida.",
          "INVALID_RESPONSE",
          502,
          body.provider,
        ),
      "Não foi possível gerar o conteúdo da Academy.",
    );
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
