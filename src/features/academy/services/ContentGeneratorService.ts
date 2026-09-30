import { AIClient, AIClientError } from "@/features/ai/AIClient";
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
import { validateAcademyStudy } from "../validation/academy-validation";
import { AcademyContentPersistence } from "./AcademyContentPersistence";

function contentId() {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `academy-content-${suffix}`;
}

export const academyGenerationSteps = [
  "preparing",
  "calling-ai",
  "structuring",
  "saving-library",
  "updating-learning",
  "completed",
] as const;

export type AcademyGenerationStep = (typeof academyGenerationSteps)[number];
export type AcademyGenerationState = "ready" | "generating" | "success" | "error" | "cancelled";

export type AcademyGenerationProgress = {
  stage: AcademyGenerationStep;
  completedStages: number;
  totalStages: 6;
  state: AcademyGenerationState;
  detail?: string;
};

export class AcademyGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: string,
    public readonly suggestion?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AcademyGenerationError";
  }
}

function generationError(error: unknown, phase: AcademyGenerationStep) {
  if (error instanceof AcademyGenerationError) return error;
  if (error instanceof AIClientError) {
    return new AcademyGenerationError(error.message, error.code, error.provider, error.suggestion, { cause: error });
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new AcademyGenerationError("Geração cancelada.", "CANCELLED", undefined, "Você pode iniciar uma nova geração quando quiser.", { cause: error });
  }
  if (phase === "saving-library" || phase === "updating-learning") {
    return new AcademyGenerationError(
      error instanceof Error ? error.message : "Não foi possível salvar o conteúdo gerado.",
      phase === "saving-library" ? "STORAGE_ERROR" : "INTEGRATION_ERROR",
      undefined,
      "Verifique o espaço disponível no navegador e tente novamente.",
      { cause: error },
    );
  }
  return new AcademyGenerationError(
    error instanceof Error ? error.message : "Não foi possível gerar o conteúdo.",
    "GENERATION_ERROR",
    undefined,
    "Tente novamente ou selecione outro provider nas configurações de IA.",
    { cause: error },
  );
}

function assertValidFreeStudy(study: AcademyStudy, kind: AcademyContentKind) {
  const validation = validateAcademyStudy(study);
  if (!validation.success) {
    throw new AcademyGenerationError(
      "Revise tema, matéria, nível, objetivo, duração e idioma antes de gerar.",
      "INVALID_INPUT",
      undefined,
      "Corrija os campos do estudo livre e tente novamente.",
    );
  }
  if (!kind) throw new AcademyGenerationError("Selecione um formato de conteúdo.", "INVALID_INPUT");
}

async function requestStage(
  study: AcademyStudy,
  kind: AcademyContentKind,
  stage: AcademyGenerationStage,
  previous?: unknown,
  signal?: AbortSignal,
) {
  return AIClient.request<AcademyGenerationResult>(
    "/api/academy/generate",
    { study, kind, stage, previous, generationMode: "free" },
    "Não foi possível gerar o conteúdo da Academy agora.",
    { signal },
  );
}

export const ContentGeneratorService = {
  async generateFreeContent(study: AcademyStudy, kind: AcademyContentKind, options: {
    force?: boolean;
    onProgress?: (progress: AcademyGenerationProgress) => void;
    signal?: AbortSignal;
  } = {}) {
    assertValidFreeStudy(study, kind);
    const reusable = study.contents.find((content) => content.kind === kind);
    if (reusable && !options.force) {
      options.onProgress?.({ stage: "completed", completedStages: 6, totalStages: 6, state: "success" });
      return { study, content: reusable, reused: true as const };
    }

    const generating = { ...study, status: "generating" as const, generationError: undefined, updatedAt: new Date().toISOString() };
    await AcademyStorage.put(generating);
    let phase: AcademyGenerationStep = "preparing";
    const report = (stage: AcademyGenerationStep, completedStages: number, detail?: string) => {
      phase = stage;
      options.onProgress?.({ stage, completedStages, totalStages: 6, state: "generating", detail });
    };
    try {
      report("preparing", 0, "Validando preferências do estudo livre");
      options.signal?.throwIfAborted();

      report("calling-ai", 1, "Gerando estrutura — etapa 1 de 3");
      const outlineResponse = await requestStage(generating, kind, "outline", undefined, options.signal);
      const outline = outlineResponse.data as AcademyOutlineResult;

      report("calling-ai", 1, "Gerando capítulos — etapa 2 de 3");
      const lessonsResponse = await requestStage(generating, kind, "lessons", { outline }, options.signal);
      const lessons = lessonsResponse.data as AcademyLessonsResult;

      report("calling-ai", 1, "Gerando atividades — etapa 3 de 3");
      const practiceResponse = await requestStage(generating, kind, "practice", { outline, lessons }, options.signal);
      const practice = practiceResponse.data as AcademyPracticeResult;
      report("structuring", 2, "Normalizando a resposta do provider");
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
      options.signal?.throwIfAborted();
      const persisted = await AcademyContentPersistence.persist(generating, content, {
        onPhase: (persistencePhase) => {
          if (persistencePhase === "library") report("saving-library", 3, "Salvando conteúdo e índices locais");
          else report("updating-learning", 4, "Atualizando Learning Engine e Knowledge Graph");
        },
      });
      phase = "completed";
      options.onProgress?.({ stage: "completed", completedStages: 6, totalStages: 6, state: "success", detail: "Conteúdo pronto" });
      return { ...persisted, reused: false as const };
    } catch (cause) {
      const error = generationError(cause, phase);
      const cancelled = error.code === "CANCELLED";
      await AcademyStorage.put({
        ...generating,
        status: cancelled ? "cancelled" : "error",
        generationError: error.message,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
      options.onProgress?.({
        stage: phase,
        completedStages: Math.min(5, academyGenerationSteps.indexOf(phase)),
        totalStages: 6,
        state: cancelled ? "cancelled" : "error",
        detail: error.message,
      });
      throw error;
    }
  },

  generate(study: AcademyStudy, kind: AcademyContentKind, options: {
    force?: boolean;
    onProgress?: (progress: AcademyGenerationProgress) => void;
    signal?: AbortSignal;
  } = {}) {
    return this.generateFreeContent(study, kind, options);
  },
};
