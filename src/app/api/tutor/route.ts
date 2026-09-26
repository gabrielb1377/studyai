import { NextResponse } from "next/server";
import { AIService } from "@/features/ai/AIService";
import { normalizeAIError } from "@/features/ai/AIErrors";
import {
  isAIModelPreferences,
  isAIProviderId,
  isAISelectionMode,
  type AIModelPreferences,
  type AIProviderId,
  type AISelectionMode,
} from "@/features/ai/AIProvider";
import { PromptBuilder } from "@/features/ai/PromptBuilder";
import { isRetrievedChunk } from "@/features/retrieval/retrieval-validation";
import type { TutorMessage } from "@/types/tutor";
import type { TutorStudyContext } from "@/types/tutor-context";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { isTutorStudyContext } from "@/features/tutor/utils/tutor-context-validation";
import { TokenCounter } from "@/features/ai/TokenCounter";
import type { TeacherRequest } from "@/features/teacher/types";
import { isTeacherRequest } from "@/features/teacher/teacher-validation";

export const runtime = "nodejs";

type TutorRequest = {
  history: Array<Pick<TutorMessage, "content" | "role">>;
  message: string;
  context?: TutorStudyContext;
  chunks?: RetrievedChunk[];
  model?: string;
  models?: AIModelPreferences;
  mode?: AISelectionMode;
  provider?: AIProviderId;
  stream?: boolean;
  teaching?: TeacherRequest;
};

function isTutorRequest(value: unknown): value is TutorRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Partial<TutorRequest>;
  return typeof request.message === "string" && request.message.trim().length > 0 &&
    (request.model === undefined || (typeof request.model === "string" && request.model.trim().length > 0)) &&
    isAIModelPreferences(request.models) &&
    (request.mode === undefined || isAISelectionMode(request.mode)) &&
    (request.provider === undefined || isAIProviderId(request.provider)) &&
    (request.stream === undefined || typeof request.stream === "boolean") &&
    (request.teaching === undefined || isTeacherRequest(request.teaching)) &&
    (request.context === undefined || isTutorStudyContext(request.context)) &&
    (request.chunks === undefined || (
      Array.isArray(request.chunks) && request.chunks.length <= 10 &&
      request.chunks.every(isRetrievedChunk)
    )) &&
    Array.isArray(request.history) && request.history.every((message) =>
      typeof message === "object" && message !== null &&
      (message.role === "assistant" || message.role === "user") &&
      typeof message.content === "string",
    );
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isTutorRequest(body)) {
    return NextResponse.json(
      { code: "INVALID_REQUEST", error: "Mensagem ou histórico inválido." },
      { status: 400 },
    );
  }

  try {
    const prompt = PromptBuilder.contextual({
      question: body.message,
      history: body.history,
      studyContext: body.context,
      chunks: body.chunks,
      teaching: body.teaching,
    });
    const aiRequest = {
      history: prompt.history,
      message: prompt.message,
      model: body.model,
      models: body.models,
      mode: body.mode,
      signal: request.signal,
      provider: body.provider,
      stream: body.stream,
    };
    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const event of AIService.stream(aiRequest)) {
              const payload = event.type === "done"
                ? {
                    ...event,
                    response: {
                      ...event.response,
                      usage: {
                        ...event.response.usage,
                        inputTokens: event.response.usage?.inputTokens ?? prompt.metrics.promptTokens,
                        outputTokens: event.response.usage?.outputTokens ?? TokenCounter.estimate(event.response.text),
                        totalTokens: event.response.usage?.totalTokens ?? prompt.metrics.promptTokens + TokenCounter.estimate(event.response.text),
                        contextTokens: prompt.metrics.contextTokens,
                        historyTokens: prompt.metrics.compressedHistoryTokens,
                        chunkTokens: prompt.metrics.chunkTokens,
                      },
                    },
                  }
                : event;
              controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
            }
          } catch (error) {
            const normalized = normalizeAIError(error, "Erro inesperado ao consultar o Tutor IA.");
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", ...normalized.body })}\n`));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }
    const response = await AIService.generate(aiRequest);
    const outputTokens = response.usage?.outputTokens ?? TokenCounter.estimate(response.text);
    return NextResponse.json({
      ...response,
      usage: {
        ...response.usage,
        inputTokens: response.usage?.inputTokens ?? prompt.metrics.promptTokens,
        outputTokens,
        totalTokens: response.usage?.totalTokens ?? prompt.metrics.promptTokens + outputTokens,
        contextTokens: prompt.metrics.contextTokens,
        historyTokens: prompt.metrics.compressedHistoryTokens,
        chunkTokens: prompt.metrics.chunkTokens,
      },
    });
  } catch (error) {
    const normalized = normalizeAIError(error, "Erro inesperado ao consultar o Tutor IA.");
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
