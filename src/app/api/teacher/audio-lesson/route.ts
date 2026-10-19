import { NextResponse } from "next/server";

import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { aiProviderIds, type AIProviderId } from "@/features/ai/AIProvider";
import {
  generateAlternativeExplanation,
  generateExerciseCorrection,
  generateNarratedLessonPlan,
} from "@/features/teacher/services/TeacherAudioLessonService";
import type { TeacherRequest } from "@/features/teacher/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action: "plan" | "alternative" | "correction";
  topic?: string;
  context?: string;
  previousExplanation?: string;
  question?: string;
  studentAnswer?: string;
  steps?: number;
  teaching?: TeacherRequest;
};

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    const body = await jsonBody<Body>(request);

    // Prioriza a chave individual (BYOK) do usuário; usa a do servidor como fallback.
    const userKeys = await Promise.all(
      aiProviderIds.map(async (provider) => [provider, await ApiKeyService.getDecrypted(user.sub, provider)] as const),
    );
    const apiKeys: Partial<Record<AIProviderId, string>> = {};
    for (const [provider, key] of userKeys) if (key) apiKeys[provider] = key;

    const teaching = body.teaching ?? {
      mode: "teacher",
      action: "audio_lesson",
      level: "intermediate",
      method: "step_by_step",
      summaryStyle: "medium",
    };

    if (body.action === "plan") {
      const plan = await generateNarratedLessonPlan({
        topic: body.topic ?? teaching.action,
        context: body.context,
        teaching,
        steps: body.steps,
        apiKeys,
      });
      return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "alternative") {
      const alternative = await generateAlternativeExplanation({
        topic: body.topic ?? teaching.action,
        previousExplanation: body.previousExplanation ?? "",
        teaching,
        apiKeys,
      });
      return NextResponse.json({ alternative }, { headers: { "Cache-Control": "no-store" } });
    }

    const correction = await generateExerciseCorrection({
      question: body.question ?? "",
      studentAnswer: body.studentAnswer ?? "",
      teaching,
      apiKeys,
    });
    return NextResponse.json({
      originalText: body.studentAnswer ?? "",
      suggestedText: correction.spoken,
      explanation: correction.correct ? "Resposta correta." : "Resposta que precisa de ajuste.",
      action: "improve-writing",
      correct: correction.correct,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
