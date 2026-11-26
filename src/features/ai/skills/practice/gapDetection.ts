/**
 * StudyAI — Intelligence Engine (IE-4C)
 * Especificação pedagógica: gap.detection (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#16):
 * - Objetivo: Mostrar lacunas e priorizar.
 * - Base existente: `learning/errors/DifficultyMapEngine.ts` e `StudyPriorityEngine.ts`.
 * - Ferramentas (fase): `performance`, `errors` (declarativas até Onda 3).
 * - Orçamento inicial: 2.000 entrada / 500 saída.
 *
 * O `DifficultyMapEngine` e o `StudyPriorityEngine` permanecem como fonte de verdade
 * para classificações (`insufficient_data`, `critical`, `attention`, `mastered`) e
 * pontuações de prioridade. Ausência de dados nunca é tratada como baixo desempenho.
 */

import {
  DifficultyMapEngine,
  type DifficultyLevelState,
  type DifficultyMapInput,
  type DifficultyMapItem,
} from "@/features/learning/errors/DifficultyMapEngine";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface GapDetectionSnapshot {
  readonly hasHistory: boolean;
  readonly items: readonly DifficultyMapItem[];
  readonly contextSummary: string;
}

export interface DetectedGapItem {
  readonly studyId: string;
  readonly title: string;
  readonly classification: DifficultyLevelState;
  readonly priorityScore: number;
  readonly evidenceSummary: string;
  readonly reviewRecommendation: string;
}

export interface GapDetectionOutput {
  readonly hasHistory: boolean;
  readonly gaps: readonly DetectedGapItem[];
  readonly overallGuidance: string;
}

export const GAP_DETECTION_FALLBACK_JSON = JSON.stringify({
  hasHistory: false,
  gaps: [],
  overallGuidance:
    "Ainda não há evidências suficientes de avaliações ou erros registrados para mapear lacunas. Complete um quiz ou revisão para gerar o mapa de dificuldades.",
} satisfies GapDetectionOutput);

/**
 * Adaptador puro (sem efeitos colaterais) sobre `DifficultyMapEngine.build` (que usa
 * `KnowledgeEngine` e `StudyPriorityEngine`).
 */
export function buildGapDetectionSnapshot(input: DifficultyMapInput): GapDetectionSnapshot {
  const { items } = DifficultyMapEngine.build(input);
  const hasHistory = items.some((item) => item.level !== "insufficient_data");
  const lines = [
    `DifficultyMapEngine: hasHistory=${hasHistory}, totalStudies=${items.length}.`,
    ...(items.length > 0
      ? items.map(
          (item) =>
            `- studyId=${item.study.studyId} | title="${item.study.title}" | level=${item.level} | priorityScore=${item.priority.score} | pendingErrors=${item.pendingErrorsCount} | knowledge=${item.knowledge.knowledge}%`,
        )
      : ["- Nenhum estudo avaliado no contexto."]),
  ];
  return {
    hasHistory,
    items,
    contextSummary: lines.join("\n"),
  };
}

export function validateGapDetectionOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: GapDetectionOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as GapDetectionOutput;
  } catch {
    return { valid: false, errors: ["A saída de gap.detection não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de gap.detection deve ser um objeto JSON."] };
  }

  if (typeof parsed.hasHistory !== "boolean") {
    errors.push("A propriedade 'hasHistory' deve ser um booleano.");
  }

  const validLevels: DifficultyLevelState[] = ["insufficient_data", "critical", "attention", "mastered"];
  if (!Array.isArray(parsed.gaps)) {
    errors.push("A propriedade 'gaps' deve ser uma lista de diagnósticos por estudo.");
  } else {
    parsed.gaps.forEach((gap, idx) => {
      if (!gap?.studyId?.trim() || !gap?.title?.trim() || !gap?.evidenceSummary?.trim() || !gap?.reviewRecommendation?.trim()) {
        errors.push(`Lacuna ${idx + 1} exige 'studyId', 'title', 'evidenceSummary' e 'reviewRecommendation'.`);
      }
      if (!validLevels.includes(gap?.classification)) {
        errors.push(`Lacuna ${idx + 1} possui classificação inválida "${gap?.classification}".`);
      }
      if (typeof gap?.priorityScore !== "number" || !Number.isFinite(gap.priorityScore) || gap.priorityScore < 0 || gap.priorityScore > 100) {
        errors.push(`Lacuna ${idx + 1} possui 'priorityScore' fora do intervalo 0..100.`);
      }
    });
  }

  if (!parsed.overallGuidance || typeof parsed.overallGuidance !== "string" || !parsed.overallGuidance.trim()) {
    errors.push("A propriedade 'overallGuidance' deve conter uma orientação geral não vazia.");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

/**
 * Garante correspondência estrita com `DifficultyMapEngine` e `StudyPriorityEngine`:
 * bloqueia `studyId` inventado, classificação alterada (ex.: tratar `insufficient_data`
 * como `critical`) ou `priorityScore` fabricado.
 */
export function validateGapDetectionAgainstSnapshot(
  parsed: GapDetectionOutput,
  snapshot: GapDetectionSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const byStudyId = new Map(snapshot.items.map((item) => [item.study.studyId, item]));

  if (parsed.hasHistory !== snapshot.hasHistory) {
    errors.push(`Inconsistência em hasHistory: esperado ${snapshot.hasHistory}, recebido ${parsed.hasHistory}.`);
  }

  parsed.gaps.forEach((gap, idx) => {
    const official = byStudyId.get(gap.studyId);
    if (!official) {
      errors.push(`Lacuna ${idx + 1} referencia studyId inventado ou fora do snapshot autorizado: "${gap.studyId}".`);
      return;
    }
    if (gap.classification !== official.level) {
      errors.push(
        `Lacuna ${idx + 1} ("${gap.studyId}") alterou classificação determinística: esperado "${official.level}", recebido "${gap.classification}".`,
      );
    }
    if (gap.priorityScore !== official.priority.score) {
      errors.push(
        `Lacuna ${idx + 1} ("${gap.studyId}") alterou priorityScore determinístico: esperado ${official.priority.score}, recebido ${gap.priorityScore}.`,
      );
    }
  });

  return { valid: errors.length === 0, errors };
}

export const gapDetectionSkillSpec: SkillSpec = {
  id: "gap.detection",
  version: "0.1.0",
  objective: "Apresentar e priorizar lacunas de aprendizagem preservando as classificações do DifficultyMapEngine e os scores do StudyPriorityEngine.",
  triggers: [
    {
      type: "action",
      value: "detect_learning_gaps",
      description: "Análise de lacunas no módulo de Aprendizagem / Mapa de Dificuldades.",
    },
    {
      type: "intent",
      value: "identify_weak_topics",
      description: "Estudante pergunta quais são suas maiores dificuldades e o que priorizar.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        referenceDate: { type: "string" },
        studyId: { type: "string" },
      },
      required: ["referenceDate"],
    },
    required: ["referenceDate"],
  },
  allowedContext: ["study", "profile", "errors"],
  allowedTools: ["performance", "errors"],
  output: {
    type: "json",
    formatDescription:
      "Objeto JSON com hasHistory, gaps ([{studyId, title, classification, priorityScore, evidenceSummary, reviewRecommendation}]) e overallGuidance.",
    example: JSON.stringify({
      hasHistory: true,
      gaps: [
        {
          studyId: "study-grafos",
          title: "Grafos",
          classification: "critical",
          priorityScore: 78,
          evidenceSummary: "2 erros pendentes e média abaixo de 50% no quiz recente.",
          reviewRecommendation: "Refazer os 2 exercícios do Caderno de Erros antes de avançar.",
        },
      ],
      overallGuidance: "Foque primeiro nos tópicos classificados como 'critical' com erros pendentes.",
    }),
    requiredKeys: ["hasHistory", "gaps", "overallGuidance"],
    validator: validateGapDetectionOutput,
  },
  tokenBudget: {
    input: 2000,
    output: 500,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    requiresContextualValidation: true,
    forbiddenOutputs: [
      "erros ou pontuações inventadas",
      "atualização automática de históricos de erro",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Preserva studyId, classification e priorityScore do DifficultyMapEngine / StudyPriorityEngine",
      "Nunca interpreta insufficient_data como baixo desempenho (critical)",
      "Não inventa erros, notas ou tópicos ausentes do snapshot",
    ],
    maxOutputWords: 320,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: GAP_DETECTION_FALLBACK_JSON,
    description: "Diagnóstico conservador em JSON indicando evidência insuficiente sem inventar lacunas.",
  },
};
