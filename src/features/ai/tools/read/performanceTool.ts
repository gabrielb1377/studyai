/**
 * StudyAI — Tool Engine (TE-3)
 * Ferramenta de leitura `performance@0.1.0` (classe `read`, execução local no cliente).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §4 e §7:
 * - Reutiliza `AnalyticsEngine.build` e `KnowledgeEngine.calculate` (sem fórmulas redundantes).
 * - Diferencia explicitamente ausência de dados (`no_data`) de desempenho baixo,
 *   e métricas observadas (`observedMetrics`) de indicadores derivados (`derivedIndicators`).
 * - Restrita à conta ativa validada pelo `SessionOperationManager`; zero escrita no perfil.
 */

import { AnalyticsEngine } from "@/features/analytics/AnalyticsEngine";
import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";
import type { ToolRegistryImpl } from "../ToolRegistry";
import type { ToolExecutorFn, ToolSpec } from "../types";
import {
  filterOwnedRecords,
  getToolAccountReadProvider,
  runWithVerifiedAccountSession,
} from "./AccountReadProvider";

export const PERFORMANCE_MAX_TOPICS = 8;

export interface PerformanceTopicSummary {
  readonly studyId: string;
  readonly topic: string;
  readonly retention: number;
  readonly status: "forgetting" | "stable" | "mastered";
}

export interface PerformanceToolOutput extends Record<string, unknown> {
  readonly dataStatus: "sufficient" | "no_data";
  readonly observedMetrics: {
    readonly totalMinutes: number;
    readonly quizzesCompleted: number;
    readonly flashcardsAnswered: number;
    readonly correctAnswers: number;
    readonly wrongAnswers: number;
    readonly currentStreak: number;
  };
  readonly derivedIndicators: {
    readonly averageRetention?: number;
    readonly reviewsNext7Days: number;
    readonly topics: readonly PerformanceTopicSummary[];
  };
  readonly note: string;
}

export const executePerformanceTool: ToolExecutorFn = async (args, context): Promise<PerformanceToolOutput> => {
  const studyId = typeof args.studyId === "string" ? args.studyId.trim() : undefined;
  const referenceDate = typeof args.referenceDate === "string" ? args.referenceDate.trim() : undefined;
  const now = referenceDate && !Number.isNaN(Date.parse(referenceDate)) ? new Date(referenceDate) : new Date();

  return runWithVerifiedAccountSession(context.userId, async (operation) => {
    const provider = getToolAccountReadProvider();
    const dataset = await provider.loadPerformance(operation.userId, operation.signal);
    operation.assertCurrent();

    const profile =
      dataset.profile && dataset.profile.ownerId === operation.userId ? dataset.profile : null;
    let studies = filterOwnedRecords(dataset.studies, operation.userId);
    const flashcards = filterOwnedRecords(dataset.flashcards, operation.userId);
    const quizzes = filterOwnedRecords(dataset.quizzes, operation.userId);

    if (studyId) {
      studies = studies.filter((s) => s.studyId === studyId);
    }

    const hasObservedActivity =
      Boolean(profile) &&
      (profile!.totalStudyMinutes > 0 ||
        profile!.quizzesCompleted > 0 ||
        profile!.flashcardsAnswered > 0 ||
        profile!.activities.length > 0 ||
        quizzes.length > 0);

    if (!profile || (!hasObservedActivity && studies.length === 0)) {
      return {
        dataStatus: "no_data",
        observedMetrics: {
          totalMinutes: 0,
          quizzesCompleted: 0,
          flashcardsAnswered: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          currentStreak: 0,
        },
        derivedIndicators: {
          reviewsNext7Days: 0,
          topics: [],
        },
        note: "Sem histórico suficiente de desempenho registrado para esta conta/filtro (ausência de dados não indica baixo desempenho).",
      };
    }

    // Reutiliza KnowledgeEngine e AnalyticsEngine com isolamento por accountId
    const knowledge = studies.map((study) =>
      KnowledgeEngine.calculate(study, profile, flashcards, quizzes, now),
    );
    const snapshot = AnalyticsEngine.build({
      accountId: operation.userId,
      studies,
      profile,
      knowledge,
      flashcards: studyId ? flashcards.filter((c) => c.studyId === studyId) : flashcards,
      quizzes: studyId ? quizzes.filter((q) => q.studyId === studyId) : quizzes,
      graphs: [],
      now,
    });

    const topics: PerformanceTopicSummary[] = snapshot.forgetting
      .slice(0, PERFORMANCE_MAX_TOPICS)
      .map((item) => ({
        studyId: item.studyId,
        topic: item.topic,
        retention: item.retention,
        status: item.status,
      }));

    const avgRetention =
      topics.length > 0
        ? Math.round(topics.reduce((sum, item) => sum + item.retention, 0) / topics.length)
        : null;

    return {
      dataStatus: hasObservedActivity ? "sufficient" : "no_data",
      observedMetrics: {
        totalMinutes: snapshot.totalMinutes,
        quizzesCompleted: profile.quizzesCompleted,
        flashcardsAnswered: profile.flashcardsAnswered,
        correctAnswers: profile.correctAnswers,
        wrongAnswers: profile.wrongAnswers,
        currentStreak: snapshot.currentStreak,
      },
      derivedIndicators: {
        ...(hasObservedActivity && avgRetention !== null ? { averageRetention: avgRetention } : {}),
        reviewsNext7Days: snapshot.forecast.reviewsNext7Days,
        topics,
      },
      note: hasObservedActivity
        ? "Indicadores calculados exclusivamente pelo AnalyticsEngine/KnowledgeEngine da conta ativa."
        : "Estudos listados sem sessões avaliadas; ausência de dados diferenciada de baixo desempenho.",
    };
  });
};

export const performanceToolSpec: ToolSpec = {
  id: "performance",
  version: "0.1.0",
  class: "read",
  description:
    "Consulta métricas observadas e indicadores derivados de desempenho da conta ativa via AnalyticsEngine e KnowledgeEngine.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      studyId: { type: "string", minLength: 1, maxLength: 120 },
      referenceDate: { type: "string", minLength: 10, maxLength: 40 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["dataStatus", "observedMetrics", "derivedIndicators", "note"],
    properties: {
      dataStatus: { type: "string", enum: ["sufficient", "no_data"] },
      observedMetrics: {
        type: "object",
        required: [
          "totalMinutes",
          "quizzesCompleted",
          "flashcardsAnswered",
          "correctAnswers",
          "wrongAnswers",
          "currentStreak",
        ],
        properties: {
          totalMinutes: { type: "number", min: 0 },
          quizzesCompleted: { type: "number", min: 0 },
          flashcardsAnswered: { type: "number", min: 0 },
          correctAnswers: { type: "number", min: 0 },
          wrongAnswers: { type: "number", min: 0 },
          currentStreak: { type: "number", min: 0 },
        },
      },
      derivedIndicators: {
        type: "object",
        required: ["reviewsNext7Days", "topics"],
        properties: {
          averageRetention: { type: "number", min: 0, max: 100 },
          reviewsNext7Days: { type: "number", min: 0 },
          topics: {
            type: "array",
            maxItems: PERFORMANCE_MAX_TOPICS,
            items: {
              type: "object",
              required: ["studyId", "topic", "retention", "status"],
              properties: {
                studyId: { type: "string", maxLength: 160 },
                topic: { type: "string", maxLength: 200 },
                retention: { type: "number", min: 0, max: 100 },
                status: { type: "string", enum: ["forgetting", "stable", "mastered"] },
              },
            },
          },
        },
      },
      note: { type: "string", maxLength: 400 },
    },
  },
  scope: {
    requiredScopes: ["account", "performance"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 2_000,
    maxInputBytes: 1_024,
    maxOutputBytes: 6_144,
    maxItems: PERFORMANCE_MAX_TOPICS,
    maxDepth: 5,
    maxCallsPerTurn: 3,
  },
  requiresConfirmation: false,
  audit: {
    recordDuration: true,
    includeStudentContent: false,
    allowedMetadataFields: ["toolId", "toolVersion", "status", "durationMs"],
  },
  tests: {
    deterministicFixtures: true,
    description: "Paridade com AnalyticsEngine e isolamento A→B.",
  },
  available: true,
};

export function registerPerformanceTool(registry: ToolRegistryImpl): void {
  if (!registry.has(performanceToolSpec.id)) {
    registry.register(performanceToolSpec, executePerformanceTool);
  }
}
