import { AIClient, AIClientError } from "@/features/ai/AIClient";
import { AI_RATE_LIMIT_MESSAGE } from "@/features/ai/AIErrors";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";
import type { AIResponse } from "@/features/ai/AIProvider";
import { SessionChangedError, SessionOperationManager } from "@/features/account/SessionOperationManager";
import { ContentStorage } from "@/features/extraction/ContentStorage";
import { ChunkStorage } from "@/features/retrieval/ChunkStorage";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { MaterialService } from "@/services/material-service";
import type { StudyRecord } from "@/types/study-engine";
import { LabFeedbackParser } from "./LabFeedbackParser";
import { modalityToLabLanguage, parseGeneratedLabChallenge } from "../validators/lab-validation";
import type {
  LabChallengeContextChunk,
  LabChallengeModality,
  LabChallengeRequest,
  LabDifficulty,
  LabGeneratedChallenge,
  LabProject,
  LabReviewRequest,
} from "../types";

const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;
const MIN_EXTRACTED_TEXT_LENGTH = 10;
const MAX_EXTRACTED_TEXT_LENGTH = 11_500;

export class LabAIRateLimitError extends Error {
  constructor(public readonly retryAfterMs = DEFAULT_RATE_LIMIT_COOLDOWN_MS) {
    super(AI_RATE_LIMIT_MESSAGE);
    this.name = "LabAIRateLimitError";
  }
}

export function isLabAIRateLimitError(error: unknown): error is LabAIRateLimitError {
  return error instanceof LabAIRateLimitError;
}

export type LabChallengeMaterialOption = {
  id: string;
  fileId: string;
  studyId?: string;
  studyTitle?: string;
  subject?: string;
  topic?: string;
  name: string;
  sourceType?: string;
  extractedText: string;
  chunks: LabChallengeContextChunk[];
  hasUsableText: boolean;
  emptyReason?: string;
};

export type LabChallengeContextData = {
  studies: StudyRecord[];
  materials: LabChallengeMaterialOption[];
};

function mergeAbortSignals(first?: AbortSignal, second?: AbortSignal) {
  if (!first) return { signal: second, cleanup: () => undefined };
  if (!second) return { signal: first, cleanup: () => undefined };
  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => () => controller.abort(source.reason);
  const onFirst = abortFrom(first);
  const onSecond = abortFrom(second);
  if (first.aborted) controller.abort(first.reason);
  else if (second.aborted) controller.abort(second.reason);
  else {
    first.addEventListener("abort", onFirst, { once: true });
    second.addEventListener("abort", onSecond, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      first.removeEventListener("abort", onFirst);
      second.removeEventListener("abort", onSecond);
    },
  };
}

export const LabAIService = {
  async listChallengeContext(): Promise<LabChallengeContextData> {
    const [studies, allMaterials, contentStore, chunkStore] = await Promise.all([
      StudyEngine.load(),
      MaterialService.load(),
      ContentStorage.load(),
      ChunkStorage.load(),
    ]);

    const studyById = new Map(studies.map((study) => [study.studyId, study]));
    const sourceMaterials = allMaterials.filter((material) => material.sourceType !== "lab");

    const materials: LabChallengeMaterialOption[] = sourceMaterials.map((material) => {
      const linkedStudy =
        (material.studyId ? studyById.get(material.studyId) : undefined) ??
        studies.find(
          (study) => study.materialIds.includes(material.id) || study.materialIds.includes(material.fileId),
        );
      const studyId = material.studyId ?? linkedStudy?.studyId;

      const matchingContents = contentStore.records
        .filter((record) => record.fileId === material.fileId || record.fileId === material.id)
        .sort((a, b) => Number(b.status === "extracted") - Number(a.status === "extracted"));
      const contentRecord = matchingContents[0];

      const matchingChunks = chunkStore.chunks
        .filter((chunk) => chunk.fileId === material.fileId || chunk.fileId === material.id)
        .sort((a, b) => a.chunkIndex - b.chunkIndex);

      const contentText = contentRecord?.extractedText?.trim() ?? "";
      const chunkJoinedText = matchingChunks
        .map((chunk) => chunk.text.trim())
        .filter(Boolean)
        .join("\n\n");
      const rawText = contentText || chunkJoinedText;
      const extractedText = rawText.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
      const hasUsableText = extractedText.trim().length >= MIN_EXTRACTED_TEXT_LENGTH;

      let emptyReason: string | undefined;
      if (!hasUsableText) {
        if (contentRecord?.status === "processing") {
          emptyReason = "A extração de texto deste material ainda está em andamento.";
        } else if (contentRecord?.status === "error") {
          emptyReason = "A extração de texto deste material falhou. Reprocesse ou escolha outro material.";
        } else {
          emptyReason = "Este material ainda não possui texto extraído suficiente para gerar um desafio.";
        }
      }

      const fileIdForChunks = matchingChunks[0]?.fileId ?? material.fileId ?? material.id;
      const chunks: LabChallengeContextChunk[] = matchingChunks.slice(0, 5).map((chunk) => ({
        fileId: fileIdForChunks,
        studyId: studyId ?? chunk.studyId,
        sourceName: material.name.slice(0, 240),
        text: chunk.text.trim().slice(0, 3_500),
      }));

      return {
        id: material.id,
        fileId: fileIdForChunks,
        studyId,
        studyTitle: linkedStudy?.title,
        subject: material.subject ?? linkedStudy?.subject,
        topic: material.topic ?? linkedStudy?.title,
        name: material.name,
        sourceType: material.sourceType,
        extractedText,
        chunks,
        hasUsableText,
        emptyReason,
      };
    });

    return { studies, materials };
  },

  async generateChallenge(
    input: {
      studyId?: string;
      material: LabChallengeMaterialOption;
      modality: LabChallengeModality;
      difficulty: LabDifficulty;
    },
    options: { signal?: AbortSignal } = {},
  ): Promise<LabGeneratedChallenge> {
    if (!input.material.hasUsableText || input.material.extractedText.trim().length < MIN_EXTRACTED_TEXT_LENGTH) {
      throw new Error(
        input.material.emptyReason ??
          "O material selecionado não possui texto extraído utilizável para gerar um desafio.",
      );
    }

    const snapshot = SessionOperationManager.current();
    const operation = !snapshot.suspended && snapshot.userId ? SessionOperationManager.start(snapshot.userId) : undefined;
    const merged = mergeAbortSignals(options.signal, operation?.signal);

    const requestPayload: LabChallengeRequest = {
      studyId: input.studyId ?? input.material.studyId,
      materialId: input.material.id,
      materialFileId: input.material.fileId,
      materialName: input.material.name.slice(0, 240),
      subject: input.material.subject?.slice(0, 200),
      topic: input.material.topic?.slice(0, 200),
      modality: input.modality,
      language: modalityToLabLanguage(input.modality),
      difficulty: input.difficulty,
      extractedText: input.material.extractedText.trim().slice(0, MAX_EXTRACTED_TEXT_LENGTH),
      chunks: input.material.chunks.slice(0, 5),
    };

    try {
      const response = await AIClient.request<{ challenge?: LabGeneratedChallenge }>(
        "/api/lab/challenge",
        { request: requestPayload },
        "Não foi possível gerar o desafio prático com IA.",
        {
          signal: merged.signal,
          headers: operation ? { "x-studyai-session-user": operation.userId } : undefined,
        },
      );

      operation?.assertCurrent();
      const currentSession = SessionOperationManager.current();
      if (currentSession.generation !== snapshot.generation || currentSession.userId !== snapshot.userId) {
        throw new SessionChangedError("A sessão mudou durante a geração do desafio.");
      }

      if (!response?.challenge || typeof response.challenge !== "object") {
        throw new Error("A IA retornou uma resposta incompleta ao gerar o desafio.");
      }

      return parseGeneratedLabChallenge(
        JSON.stringify(response.challenge),
        { modality: input.modality, difficulty: input.difficulty },
        {
          provider: response.challenge.provider || "ai",
          model: response.challenge.model || "default",
        },
      );
    } catch (error) {
      if (error instanceof AIClientError && (error.status === 429 || error.code === "RATE_LIMIT")) {
        throw new LabAIRateLimitError(error.retryAfterMs);
      }
      throw error;
    } finally {
      merged.cleanup();
      operation?.release();
    }
  },

  async review(project: LabProject) {
    const retrieval = project.studyId
      ? await RetrievalPipeline.forQuestion(project.exercise.statement, project.studyId)
      : undefined;
    const request: LabReviewRequest = {
      projectId: project.id,
      studyId: project.studyId,
      subject: project.subject,
      topic: project.topic,
      language: project.language,
      statement: project.exercise.statement,
      answer: project.files[project.language] ?? "",
      expectedResult: project.exercise.expectedResult,
      errors: project.lastResult?.error ? [project.lastResult.error] : [],
      context: (retrieval?.chunks ?? []).slice(0, 3).map((chunk) => ({ sourceName: chunk.metadata.sourceName, text: chunk.text })),
    };
    try {
      const response = await AIClient.request<AIResponse>("/api/lab/review", { request }, "Não foi possível corrigir o exercício.");
      return LabFeedbackParser.parse(response.text, response);
    } catch (error) {
      if (error instanceof AIClientError && (error.status === 429 || error.code === "RATE_LIMIT")) {
        throw new LabAIRateLimitError(error.retryAfterMs);
      }
      throw error;
    }
  },
};
