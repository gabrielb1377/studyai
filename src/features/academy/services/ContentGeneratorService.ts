import { AIClient } from "@/features/ai/AIClient";
import { AcademyStorage } from "../storage/AcademyStorage";
import type {
  AcademyContentKind,
  AcademyGeneratedContent,
  AcademyGenerationResult,
  AcademyGenerationStage,
  AcademyLessonsResult,
  AcademyOutlineResult,
  AcademyPracticeResult,
  AcademyStudy,
} from "../types";
import { AcademyContentPersistence } from "./AcademyContentPersistence";

function contentId() {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `academy-content-${suffix}`;
}

export type AcademyGenerationProgress = {
  stage: AcademyGenerationStage;
  completedStages: number;
  totalStages: 3;
};

async function requestStage(
  study: AcademyStudy,
  kind: AcademyContentKind,
  stage: AcademyGenerationStage,
  previous?: unknown,
) {
  return AIClient.request<AcademyGenerationResult>(
    "/api/academy/generate",
    { study, kind, stage, previous },
    "Não foi possível gerar o conteúdo da Academy agora.",
  );
}

export const ContentGeneratorService = {
  async generate(study: AcademyStudy, kind: AcademyContentKind, options: {
    force?: boolean;
    onProgress?: (progress: AcademyGenerationProgress) => void;
  } = {}) {
    const reusable = study.contents.find((content) => content.kind === kind);
    if (reusable && !options.force) return { study, content: reusable, reused: true as const };

    const generating = { ...study, status: "generating" as const, generationError: undefined, updatedAt: new Date().toISOString() };
    await AcademyStorage.put(generating);
    try {
      options.onProgress?.({ stage: "outline", completedStages: 0, totalStages: 3 });
      const outlineResponse = await requestStage(generating, kind, "outline");
      const outline = outlineResponse.data as AcademyOutlineResult;

      options.onProgress?.({ stage: "lessons", completedStages: 1, totalStages: 3 });
      const lessonsResponse = await requestStage(generating, kind, "lessons", { outline });
      const lessons = lessonsResponse.data as AcademyLessonsResult;

      options.onProgress?.({ stage: "practice", completedStages: 2, totalStages: 3 });
      const practiceResponse = await requestStage(generating, kind, "practice", { outline, lessons });
      const practice = practiceResponse.data as AcademyPracticeResult;
      const content: AcademyGeneratedContent = {
        id: contentId(),
        kind,
        ...outline,
        ...lessons,
        ...practice,
        generatedAt: new Date().toISOString(),
        provider: practiceResponse.provider,
        model: practiceResponse.model,
        inputTokens: [outlineResponse, lessonsResponse, practiceResponse].reduce((total, response) => total + (response.usage?.inputTokens ?? 0), 0) || undefined,
        outputTokens: [outlineResponse, lessonsResponse, practiceResponse].reduce((total, response) => total + (response.usage?.outputTokens ?? 0), 0) || undefined,
      };
      const persisted = await AcademyContentPersistence.persist(generating, content);
      options.onProgress?.({ stage: "practice", completedStages: 3, totalStages: 3 });
      return { ...persisted, reused: false as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível gerar o conteúdo.";
      await AcademyStorage.put({ ...generating, status: "error", generationError: message, updatedAt: new Date().toISOString() });
      throw error;
    }
  },
};
