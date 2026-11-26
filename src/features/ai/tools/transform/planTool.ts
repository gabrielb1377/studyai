/**
 * StudyAI — Tool Engine (TE-4)
 * Ferramenta canônica de planejamento determinístico com pré-visualização e confirmação (`plan@0.1.0`).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §3–§5:
 * - Classe oficial: `transform`.
 * - Reutiliza exclusivamente o `PlanningEngine` existente (nunca cria um segundo motor).
 * - Respeita objetivo, tempo diário, horizonte/datas, prioridades e materiais autorizados.
 * - Não sobrescreve plano existente sem autorização explícita (`overwriteExisting: true`),
 *   revalidando pré-condições e propriedade dos estudos no momento da persistência.
 */

import { createEmptyLearningProfile } from "@/features/learning/LearningStorage";
import { PlanningEngine } from "@/features/planning/PlanningEngine";
import type { PlanningFocus, StudyPlan, StudyPlanConfig } from "@/features/planning/types";
import { filterOwnedRecords } from "../read/AccountReadProvider";
import {
  PreconditionFailedError,
  type ToolConfirmationService,
  type ToolProposalRecord,
} from "../ToolConfirmationService";
import type { ToolExecutorFn, ToolSpec } from "../types";
import {
  getToolAccountTransformProvider,
  runWithVerifiedAccountSession,
} from "./AccountTransformProvider";

export const PLAN_TOOL_MAX_PREVIEW_SESSIONS = 24;

export interface PlanToolSessionPreview {
  readonly id: string;
  readonly dayOffset: number;
  readonly dateStr: string;
  readonly studyId: string;
  readonly title: string;
  readonly minutes: number;
  readonly priority: "high" | "medium" | "low";
  readonly kind: string;
}

export interface PlanToolOutput {
  readonly mode: "prepare" | "commit";
  readonly status:
    | "proposal_ready"
    | "committed"
    | "no_eligible_studies"
    | "unauthorized_reference";
  readonly requiresConfirmation: boolean;
  readonly mutatedState: boolean;
  readonly destination?: string;
  readonly proposalId?: string;
  readonly previewHash?: string;
  readonly expiresAt?: string;
  readonly wouldOverwriteExisting: boolean;
  readonly overwriteAuthorized: boolean;
  readonly previousItemCount: number;
  readonly proposedItemCount: number;
  readonly dailyMinutes: number;
  readonly horizonDays: number;
  readonly sessions: readonly PlanToolSessionPreview[];
  readonly savedPlanId?: string;
  readonly notice?: string;
}

interface PlanProposalPayload extends Record<string, unknown> {
  readonly plan: StudyPlan;
  readonly overwriteAuthorized: boolean;
  readonly expectedPreviousPlanId: string | null;
}

export const planToolSpec: ToolSpec = {
  id: "plan",
  version: "0.1.0",
  class: "transform",
  description:
    "Prepara propostas determinísticas de plano de estudos via PlanningEngine para pré-visualização e persiste somente após confirmação explícita, sem sobrescrita silenciosa.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["mode"],
    properties: {
      mode: { type: "string", enum: ["prepare", "commit"] },
      title: { type: "string", minLength: 1, maxLength: 100 },
      goal: { type: "string", minLength: 1, maxLength: 240 },
      dailyMinutes: { type: "number", min: 15, max: 600 },
      horizonDays: { type: "number", min: 1, max: 30 },
      preferredFocus: { type: "string", enum: ["balanced", "exams", "reviews"] },
      includeExams: { type: "boolean" },
      selectedStudyIds: {
        type: "array",
        maxItems: 12,
        items: { type: "string", minLength: 1, maxLength: 128 },
      },
      overwriteExisting: { type: "boolean" },
      referenceDate: { type: "string", minLength: 8, maxLength: 40 },
      proposalId: { type: "string", minLength: 1, maxLength: 128 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "mode",
      "status",
      "requiresConfirmation",
      "mutatedState",
      "wouldOverwriteExisting",
      "overwriteAuthorized",
      "previousItemCount",
      "proposedItemCount",
      "dailyMinutes",
      "horizonDays",
      "sessions",
    ],
    properties: {
      mode: { type: "string", enum: ["prepare", "commit"] },
      status: {
        type: "string",
        enum: ["proposal_ready", "committed", "no_eligible_studies", "unauthorized_reference"],
      },
      requiresConfirmation: { type: "boolean" },
      mutatedState: { type: "boolean" },
      destination: { type: "string", maxLength: 120 },
      proposalId: { type: "string", maxLength: 128 },
      previewHash: { type: "string", maxLength: 64 },
      expiresAt: { type: "string", maxLength: 40 },
      wouldOverwriteExisting: { type: "boolean" },
      overwriteAuthorized: { type: "boolean" },
      previousItemCount: { type: "number", min: 0, max: 200 },
      proposedItemCount: { type: "number", min: 0, max: 200 },
      dailyMinutes: { type: "number", min: 15, max: 600 },
      horizonDays: { type: "number", min: 1, max: 30 },
      sessions: {
        type: "array",
        maxItems: PLAN_TOOL_MAX_PREVIEW_SESSIONS,
        items: {
          type: "object",
          required: ["id", "dayOffset", "dateStr", "studyId", "title", "minutes", "priority", "kind"],
          properties: {
            id: { type: "string", maxLength: 160 },
            dayOffset: { type: "number", min: 0, max: 30 },
            dateStr: { type: "string", maxLength: 32 },
            studyId: { type: "string", maxLength: 128 },
            title: { type: "string", maxLength: 180 },
            minutes: { type: "number", min: 1, max: 600 },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            kind: { type: "string", maxLength: 40 },
          },
        },
      },
      savedPlanId: { type: "string", maxLength: 128 },
      notice: { type: "string", maxLength: 360 },
    },
  },
  scope: {
    requiredScopes: ["account", "plan"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 3000,
    maxInputBytes: 8192,
    maxOutputBytes: 15360,
    maxItems: PLAN_TOOL_MAX_PREVIEW_SESSIONS,
    maxDepth: 6,
    maxCallsPerTurn: 3,
  },
  requiresConfirmation: false,
  audit: {
    recordDuration: true,
    includeStudentContent: false,
    allowedMetadataFields: ["toolId", "toolVersion", "toolClass", "status", "denialReason", "durationMs"],
  },
  tests: {
    deterministicFixtures: true,
    description:
      "Valida reuso estrito de PlanningEngine, proteção contra sobrescrita não autorizada e isolamento A->B.",
  },
  available: true,
};

function toPreviewSessions(plan: StudyPlan): PlanToolSessionPreview[] {
  return plan.items.slice(0, PLAN_TOOL_MAX_PREVIEW_SESSIONS).map((item) => ({
    id: item.id.slice(0, 160),
    dayOffset: item.dayOffset,
    dateStr: item.dateStr,
    studyId: (item.studyId ?? "exam").slice(0, 128),
    title: item.title.slice(0, 180),
    minutes: item.estimatedMinutes,
    priority: item.priority,
    kind: item.kind,
  }));
}

export const executePlanTool: ToolExecutorFn = async (args, context) => {
  const mode = args.mode === "commit" ? "commit" : "prepare";
  const confirmationService = context.confirmationService as ToolConfirmationService | undefined;

  if (mode === "commit") {
    const approved = context.approvedProposal as unknown as
      | ToolProposalRecord<Record<string, unknown>, PlanProposalPayload>
      | undefined;
    if (!approved || approved.toolId !== "plan") {
      throw new PreconditionFailedError("Proposta confirmada ausente para persistência do plano.");
    }

    const payload = approved.payload;
    return runWithVerifiedAccountSession(context.userId, async (operation) => {
      const provider = getToolAccountTransformProvider();
      const dataset = await provider.loadPlanningContext(context.userId, operation.signal);
      operation.assertCurrent();

      const ownedStudies = filterOwnedRecords(dataset.studies, context.userId);
      const ownedStudyIds = new Set(ownedStudies.map((s) => s.studyId));
      const existingPlan =
        dataset.existingPlan && dataset.existingPlan.ownerId === context.userId
          ? dataset.existingPlan
          : null;

      // Proteção explícita contra sobrescrita sem autorização
      if (existingPlan && !payload.overwriteAuthorized) {
        throw new PreconditionFailedError(
          "Já existe um plano salvo nesta conta e a proposta não autorizou sobrescrita explícita.",
        );
      }

      if (
        payload.expectedPreviousPlanId !== null &&
        existingPlan &&
        existingPlan.id !== payload.expectedPreviousPlanId &&
        !payload.overwriteAuthorized
      ) {
        throw new PreconditionFailedError(
          "O plano atual foi alterado antes da confirmação ser executada.",
        );
      }

      for (const item of payload.plan.items) {
        if (item.studyId && !ownedStudyIds.has(item.studyId)) {
          throw new PreconditionFailedError(
            "Um estudo referenciado no plano não pertence mais à conta ativa.",
          );
        }
      }

      const persisted = await provider.persistStudyPlan(
        context.userId,
        payload.plan,
        operation.signal,
      );
      operation.assertCurrent();

      return {
        mode: "commit",
        status: "committed",
        requiresConfirmation: true,
        mutatedState: true,
        destination: approved.destination,
        proposalId: approved.proposalId,
        previewHash: approved.previewHash,
        wouldOverwriteExisting: Boolean(existingPlan),
        overwriteAuthorized: payload.overwriteAuthorized,
        previousItemCount: existingPlan?.items.length ?? 0,
        proposedItemCount: persisted.itemCount,
        dailyMinutes: payload.plan.dailyMinutes,
        horizonDays: payload.plan.horizonDays,
        sessions: toPreviewSessions(payload.plan),
        savedPlanId: persisted.planId,
        notice: "Plano de estudos confirmado e persistido exatamente conforme a pré-visualização aprovada.",
      } satisfies PlanToolOutput as unknown as Record<string, unknown>;
    });
  }

  // Modo `prepare`: geração determinística pura via PlanningEngine (ZERO escrita)
  const goal = typeof args.goal === "string" ? args.goal.trim() : "";
  const dailyMinutes = typeof args.dailyMinutes === "number" ? Math.round(args.dailyMinutes) : 60;
  const horizonDays = typeof args.horizonDays === "number" ? Math.round(args.horizonDays) : 7;
  const title = typeof args.title === "string" ? args.title.trim() : undefined;
  const preferredFocus: PlanningFocus =
    args.preferredFocus === "exams" || args.preferredFocus === "reviews"
      ? args.preferredFocus
      : "balanced";
  const includeExams = typeof args.includeExams === "boolean" ? args.includeExams : true;
  const overwriteExisting = args.overwriteExisting === true;
  const requestedStudyIds = Array.isArray(args.selectedStudyIds)
    ? args.selectedStudyIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const referenceNow =
    typeof args.referenceDate === "string" && Number.isFinite(Date.parse(args.referenceDate))
      ? new Date(args.referenceDate)
      : new Date();

  if (!goal) {
    throw new Error("Modo prepare de plan exige o campo 'goal'.");
  }
  if (!confirmationService) {
    throw new Error("Serviço de confirmação indisponível para registrar proposta de plano.");
  }

  return runWithVerifiedAccountSession(context.userId, async (operation) => {
    const provider = getToolAccountTransformProvider();
    const dataset = await provider.loadPlanningContext(context.userId, operation.signal);
    operation.assertCurrent();

    const ownedStudies = filterOwnedRecords(dataset.studies, context.userId);
    const ownedStudyIds = new Set(ownedStudies.map((s) => s.studyId));

    // Recusa qualquer selectedStudyIds pertencente a outra conta ou inexistente
    for (const id of requestedStudyIds) {
      if (!ownedStudyIds.has(id)) {
        return {
          mode: "prepare",
          status: "unauthorized_reference",
          requiresConfirmation: true,
          mutatedState: false,
          wouldOverwriteExisting: false,
          overwriteAuthorized: overwriteExisting,
          previousItemCount: 0,
          proposedItemCount: 0,
          dailyMinutes,
          horizonDays,
          sessions: [],
          notice: "Um ou mais estudos solicitados não pertencem à conta ativa.",
        } satisfies PlanToolOutput as unknown as Record<string, unknown>;
      }
    }

    const existingPlan =
      dataset.existingPlan && dataset.existingPlan.ownerId === context.userId
        ? dataset.existingPlan
        : null;

    if (ownedStudies.length === 0) {
      return {
        mode: "prepare",
        status: "no_eligible_studies",
        requiresConfirmation: true,
        mutatedState: false,
        wouldOverwriteExisting: Boolean(existingPlan),
        overwriteAuthorized: overwriteExisting,
        previousItemCount: existingPlan?.items.length ?? 0,
        proposedItemCount: 0,
        dailyMinutes,
        horizonDays,
        sessions: [],
        notice: "Não há estudos disponíveis na conta ativa para gerar um plano determinístico.",
      } satisfies PlanToolOutput as unknown as Record<string, unknown>;
    }

    const ownedProfile =
      dataset.profile && dataset.profile.ownerId === context.userId
        ? dataset.profile
        : createEmptyLearningProfile(referenceNow.toISOString());
    const ownedFlashcards = filterOwnedRecords(dataset.flashcards, context.userId);
    const ownedQuizzes = filterOwnedRecords(dataset.quizzes, context.userId);
    const ownedTopicReviews = filterOwnedRecords(dataset.topicReviews, context.userId);
    const ownedExams = filterOwnedRecords(dataset.exams, context.userId);
    const ownedErrors = filterOwnedRecords(dataset.errorEntries, context.userId);

    const partialConfig: Partial<StudyPlanConfig> = {
      ...(title ? { title } : {}),
      goal,
      dailyMinutes,
      horizonDays,
      includeExams,
      preferredFocus,
      selectedStudyIds: requestedStudyIds,
    };

    const rawPlan = PlanningEngine.generate(
      partialConfig,
      {
        studies: ownedStudies,
        profile: ownedProfile,
        flashcards: ownedFlashcards,
        quizzes: ownedQuizzes,
        topicReviews: ownedTopicReviews,
        exams: ownedExams,
        errorEntries: ownedErrors,
        now: referenceNow,
      },
      existingPlan,
    );

    const reconciledPlan = PlanningEngine.reconcileWithCurrentSources(
      rawPlan,
      ownedStudies,
      ownedExams,
    );
    const sessions = toPreviewSessions(reconciledPlan);
    const destination = "study-plan:v1";
    const wouldOverwriteExisting = Boolean(existingPlan);

    const proposal = confirmationService.createProposal({
      toolId: "plan",
      toolVersion: planToolSpec.version,
      userId: context.userId,
      sessionId: context.sessionId,
      turnId: context.turnId,
      destination,
      canonicalArgs: args,
      preview: {
        title: reconciledPlan.title,
        goal: reconciledPlan.goal,
        dailyMinutes: reconciledPlan.dailyMinutes,
        horizonDays: reconciledPlan.horizonDays,
        wouldOverwriteExisting,
        overwriteAuthorized: overwriteExisting,
        previousItemCount: existingPlan?.items.length ?? 0,
        sessions,
      },
      payload: {
        plan: reconciledPlan,
        overwriteAuthorized: overwriteExisting,
        expectedPreviousPlanId: existingPlan?.id ?? null,
      } satisfies PlanProposalPayload,
    });

    return {
      mode: "prepare",
      status: "proposal_ready",
      requiresConfirmation: true,
      mutatedState: false,
      destination,
      proposalId: proposal.proposalId,
      previewHash: proposal.previewHash,
      expiresAt: proposal.expiresAt,
      wouldOverwriteExisting,
      overwriteAuthorized: overwriteExisting,
      previousItemCount: existingPlan?.items.length ?? 0,
      proposedItemCount: reconciledPlan.items.length,
      dailyMinutes: reconciledPlan.dailyMinutes,
      horizonDays: reconciledPlan.horizonDays,
      sessions,
      notice:
        wouldOverwriteExisting && !overwriteExisting
          ? "Já existe um plano salvo; para substituir, prepare a proposta com overwriteExisting=true antes de confirmar."
          : "Pré-visualização determinística gerada pelo PlanningEngine. Nenhuma alteração foi persistida.",
    } satisfies PlanToolOutput as unknown as Record<string, unknown>;
  });
};
