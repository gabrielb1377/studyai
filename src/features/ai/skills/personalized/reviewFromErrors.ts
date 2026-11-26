/**
 * StudyAI — Intelligence Engine (IE-4D)
 * Especificação pedagógica: review.from-errors (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#18):
 * - Objetivo: Revisão dirigida a partir do caderno de erros.
 * - Base existente: `learning/errors/ErrorNotebookStorage.ts`, `DifficultyMapEngine.ts`,
 *   `StudyPriorityEngine.ts` e `ReviewScheduler.ts`.
 * - Ferramentas (fase): `errors` (declarativo até Onda 3).
 * - Orçamento inicial: 2.000 entrada / 600 saída.
 *
 * Regras de integridade:
 * - Reutiliza `DifficultyMapEngine.build` (priorização e revisão direcionada já existentes).
 * - Nunca inventa erros anteriores, respostas do estudante ou IDs fora do snapshot.
 * - Diferencia causas conhecidas (`knownCause`) de hipóteses pedagógicas (`pedagogicalHypothesis`).
 * - Não marca erros como resolvidos, não altera datas/intervalos do `ReviewScheduler` e
 *   não cria exercícios/revisões persistidos.
 */

import {
  DifficultyMapEngine,
  type DifficultyMapInput,
  type TargetedReviewRecommendation,
} from "@/features/learning/errors/DifficultyMapEngine";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface ErrorReviewSnapshot {
  readonly hasErrors: boolean;
  readonly pendingErrors: readonly ErrorNotebookEntry[];
  readonly recommendations: readonly TargetedReviewRecommendation[];
  readonly authorizedErrorIds: readonly string[];
  readonly authorizedStudyIds: readonly string[];
  readonly urgencyByStudyId: Readonly<Record<string, "Alta" | "Média" | "Baixa">>;
  readonly contextSummary: string;
}

export interface ErrorReinforcementExercise {
  readonly prompt: string;
  readonly expectedAnswer: string;
  /** Deve ser false para não entregar a resposta antes da tentativa do estudante. */
  readonly revealAnswerBeforeAttempt: boolean;
}

export interface ErrorReviewItem {
  readonly errorId: string;
  readonly studyId?: string;
  readonly topic: string;
  readonly observedError: string;
  readonly relatedConcept: string;
  readonly knownCause?: string;
  readonly pedagogicalHypothesis?: string;
  readonly correctionExplanation: string;
  readonly reinforcementExercises: readonly ErrorReinforcementExercise[];
  readonly reviewRecommendation: string;
  readonly urgencyLabel?: "Alta" | "Média" | "Baixa";
}

export interface ReviewFromErrorsOutput {
  readonly hasErrors: boolean;
  readonly reviewItems: readonly ErrorReviewItem[];
  readonly overallGuidance: string;
}

export const REVIEW_FROM_ERRORS_FALLBACK_JSON = JSON.stringify({
  hasErrors: false,
  reviewItems: [],
  overallGuidance:
    "Nenhum erro pendente registrado no caderno de erros para revisão dirigida neste momento. Continue praticando e registre eventuais dúvidas para gerar revisões direcionadas.",
} satisfies ReviewFromErrorsOutput);

/**
 * Adaptador puro (sem efeitos colaterais) sobre `ErrorNotebookEntry` e `DifficultyMapEngine.build`.
 */
export function buildErrorReviewSnapshot(input: DifficultyMapInput): ErrorReviewSnapshot {
  const { recommendations } = DifficultyMapEngine.build(input);
  const pendingErrors = input.errorEntries.filter((e) => e.status !== "resolved");
  const hasErrors = pendingErrors.length > 0;

  const authorizedErrorIds = pendingErrors.map((e) => e.id);
  const studyIds = new Set<string>();
  for (const s of input.studies) studyIds.add(s.studyId);
  for (const e of pendingErrors) {
    if (e.studyId) studyIds.add(e.studyId);
  }
  const authorizedStudyIds = Array.from(studyIds);

  const urgencyByStudyId: Record<string, "Alta" | "Média" | "Baixa"> = {};
  for (const rec of recommendations) {
    urgencyByStudyId[rec.studyId] = rec.urgencyLabel;
  }

  const lines = [
    `ErrorNotebook + DifficultyMapEngine: hasErrors=${hasErrors}, pendingErrors=${pendingErrors.length}, targetedRecommendations=${recommendations.length}.`,
    ...(pendingErrors.length > 0
      ? pendingErrors.slice(0, 8).map(
          (e) =>
            `- errorId=${e.id} | studyId=${e.studyId ?? "none"} | topic="${e.topic}" | occurrences=${e.occurrences} | prompt="${e.questionPrompt}" | wrongAnswer="${e.wrongAnswer}"`,
        )
      : ["- Nenhum erro pendente no caderno de erros."]),
    ...recommendations
      .slice(0, 5)
      .map(
        (rec) =>
          `- recommendation studyId=${rec.studyId} | urgency=${rec.urgencyLabel} (${rec.urgencyScore}) | reviewStatus=${rec.reviewStatus}`,
      ),
  ];

  return {
    hasErrors,
    pendingErrors,
    recommendations,
    authorizedErrorIds,
    authorizedStudyIds,
    urgencyByStudyId,
    contextSummary: lines.join("\n"),
  };
}

export function validateReviewFromErrorsOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: ReviewFromErrorsOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as ReviewFromErrorsOutput;
  } catch {
    return { valid: false, errors: ["A saída de review.from-errors não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de review.from-errors deve ser um objeto JSON."] };
  }

  if (typeof parsed.hasErrors !== "boolean") {
    errors.push("Campo 'hasErrors' deve ser booleano.");
  }
  if (!Array.isArray(parsed.reviewItems)) {
    errors.push("Campo 'reviewItems' deve ser um array.");
  } else {
    parsed.reviewItems.forEach((item, idx) => {
      if (!item || typeof item.errorId !== "string" || !item.errorId.trim()) {
        errors.push(`reviewItems[${idx}] exige 'errorId'.`);
      }
      if (!item || typeof item.topic !== "string" || !item.topic.trim()) {
        errors.push(`reviewItems[${idx}] exige 'topic'.`);
      }
      if (!item || typeof item.observedError !== "string" || !item.observedError.trim()) {
        errors.push(`reviewItems[${idx}] exige 'observedError'.`);
      }
      if (!item || typeof item.relatedConcept !== "string" || !item.relatedConcept.trim()) {
        errors.push(`reviewItems[${idx}] exige 'relatedConcept'.`);
      }
      if (!item || typeof item.correctionExplanation !== "string" || !item.correctionExplanation.trim()) {
        errors.push(`reviewItems[${idx}] exige 'correctionExplanation'.`);
      }
      const hasKnown = typeof item?.knownCause === "string" && item.knownCause.trim().length > 0;
      const hasHypothesis =
        typeof item?.pedagogicalHypothesis === "string" && item.pedagogicalHypothesis.trim().length > 0;
      if (!hasKnown && !hasHypothesis) {
        errors.push(
          `reviewItems[${idx}] deve informar 'knownCause' (causa demonstrada) ou 'pedagogicalHypothesis' (hipótese pedagógica).`,
        );
      }
      if (!Array.isArray(item?.reinforcementExercises) || item.reinforcementExercises.length === 0) {
        errors.push(`reviewItems[${idx}] exige ao menos um exercício de reforço em 'reinforcementExercises'.`);
      } else {
        item.reinforcementExercises.forEach((ex: ErrorReinforcementExercise, exIdx: number) => {
          if (!ex || typeof ex.prompt !== "string" || !ex.prompt.trim()) {
            errors.push(`reviewItems[${idx}].reinforcementExercises[${exIdx}] exige 'prompt'.`);
          }
          if (!ex || typeof ex.expectedAnswer !== "string" || !ex.expectedAnswer.trim()) {
            errors.push(`reviewItems[${idx}].reinforcementExercises[${exIdx}] exige 'expectedAnswer'.`);
          }
          if (ex?.revealAnswerBeforeAttempt !== false) {
            errors.push(
              `reviewItems[${idx}].reinforcementExercises[${exIdx}] deve definir revealAnswerBeforeAttempt=false.`,
            );
          }
        });
      }
      if (!item || typeof item.reviewRecommendation !== "string" || !item.reviewRecommendation.trim()) {
        errors.push(`reviewItems[${idx}] exige 'reviewRecommendation'.`);
      }
    });
  }

  if (typeof parsed.overallGuidance !== "string" || parsed.overallGuidance.trim().length < 10) {
    errors.push("Campo 'overallGuidance' deve ser preenchido.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validação contextual determinística contra o snapshot autorizado do Caderno de Erros e DifficultyMapEngine.
 */
export function validateReviewFromErrorsAgainstSnapshot(
  parsed: ReviewFromErrorsOutput,
  snapshot: ErrorReviewSnapshot,
): SkillValidationResult {
  const errors: string[] = [];

  if (parsed.hasErrors !== snapshot.hasErrors) {
    errors.push(`Divergência em 'hasErrors': esperado ${snapshot.hasErrors}, recebido ${parsed.hasErrors}.`);
  }

  if (!snapshot.hasErrors) {
    if (parsed.reviewItems.length > 0) {
      errors.push("Sem erros registrados no snapshot, 'reviewItems' deve permanecer vazio.");
    }
    return { valid: errors.length === 0, errors };
  }

  const authorizedErrors = new Set(snapshot.authorizedErrorIds);
  const authorizedStudies = new Set(snapshot.authorizedStudyIds);

  parsed.reviewItems.forEach((item, idx) => {
    if (!authorizedErrors.has(item.errorId)) {
      errors.push(`reviewItems[${idx}] referencia errorId inventado ou não autorizado: "${item.errorId}".`);
    }
    if (item.studyId && !authorizedStudies.has(item.studyId)) {
      errors.push(`reviewItems[${idx}] referencia studyId fora do snapshot autorizado: "${item.studyId}".`);
    }
    if (item.studyId && item.urgencyLabel) {
      const officialUrgency = snapshot.urgencyByStudyId[item.studyId];
      if (officialUrgency && item.urgencyLabel !== officialUrgency) {
        errors.push(
          `reviewItems[${idx}] divergiu da urgência do DifficultyMapEngine para "${item.studyId}": esperado "${officialUrgency}", recebido "${item.urgencyLabel}".`,
        );
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

export const reviewFromErrorsSkillSpec: SkillSpec = {
  id: "review.from-errors",
  version: "0.1.0",
  objective:
    "Gerar revisão dirigida a partir dos erros reais registrados no caderno de erros, preservando prioridades do DifficultyMapEngine/ReviewScheduler sem mutar o estado persistido.",
  triggers: [
    {
      type: "action",
      value: "review_from_errors",
      description: "Revisão dirigida disparada no módulo Caderno de Erros / Aprendizagem.",
    },
    {
      type: "intent",
      value: "revisit_past_mistakes",
      description: "Estudante pede para revisar os erros cometidos recentemente.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        referenceDate: { type: "string" },
        studyId: { type: "string" },
        errorReviewSummary: { type: "string" },
      },
      required: ["referenceDate"],
    },
    required: ["referenceDate"],
  },
  output: {
    type: "json",
    requiredKeys: ["hasErrors", "reviewItems", "overallGuidance"],
    formatDescription:
      'JSON estrito: { hasErrors: boolean, reviewItems: [{ errorId, studyId?, topic, observedError, relatedConcept, knownCause?, pedagogicalHypothesis?, correctionExplanation, reinforcementExercises: [{ prompt, expectedAnswer, revealAnswerBeforeAttempt: false }], reviewRecommendation, urgencyLabel? }], overallGuidance: string }.',
    validator: validateReviewFromErrorsOutput,
  },
  allowedContext: ["study", "profile", "errors"],
  allowedTools: ["errors"],
  tokenBudget: {
    input: 2000,
    output: 600,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: false,
    requiresContextualValidation: true,
    forbiddenOutputs: [
      "erros ou IDs inventados fora do caderno de erros",
      "marcação automática de erros como resolvidos",
      "alteração de intervalos ou datas do ReviewScheduler",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Preservar exatamente os errorId e urgências provenientes do Caderno de Erros e DifficultyMapEngine.",
      "Diferenciar causas conhecidas de hipóteses pedagógicas.",
      "Não inventar erros anteriores quando o caderno estiver vazio.",
      "Não alterar estado de erros nem datas/intervalos do ReviewScheduler.",
    ],
    maxOutputWords: 400,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: REVIEW_FROM_ERRORS_FALLBACK_JSON,
    description: "Revisão conservadora em JSON indicando ausência de erros pendentes sem inventar histórico.",
  },
};
