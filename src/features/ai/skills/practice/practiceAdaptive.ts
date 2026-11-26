/**
 * StudyAI — Intelligence Engine (IE-4C)
 * Especificação pedagógica: practice.adaptive (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#10):
 * - Objetivo: Exercícios no nível certo.
 * - Base existente: `learning/adaptive/AdaptiveAssessmentEngine.ts`.
 * - Ferramentas (fase): `quiz`, `performance` (declarativas até Onda 3).
 * - Orçamento inicial: 2.500 entrada / 800 saída.
 *
 * O `AdaptiveAssessmentEngine` permanece como fonte de verdade para recomendação
 * de dificuldade. A skill não altera o perfil do estudante e não revela respostas
 * antes da tentativa (`revealAnswerBeforeAttempt: false`).
 */

import { AdaptiveAssessmentEngine } from "@/features/learning/adaptive/AdaptiveAssessmentEngine";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";
import type { QuizDifficulty, QuizResult } from "@/types/quiz";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface AdaptivePracticeSnapshot {
  readonly hasHistory: boolean;
  readonly knowledgeScore?: number;
  readonly recommendedDifficulty: QuizDifficulty;
  readonly pendingErrorCount: number;
  readonly contextSummary: string;
}

export interface AdaptiveExerciseItem {
  readonly id: string;
  readonly prompt: string;
  readonly difficulty: QuizDifficulty;
  readonly expectedAnswer: string;
  readonly gradingCriteria: string;
  readonly revealAnswerBeforeAttempt: boolean;
  readonly sourceRef?: string;
}

export interface PracticeAdaptiveOutput {
  readonly targetDifficulty: QuizDifficulty;
  readonly hasHistory: boolean;
  readonly exercises: readonly AdaptiveExerciseItem[];
  readonly progressionNote: string;
}

export const PRACTICE_ADAPTIVE_FALLBACK_JSON = JSON.stringify({
  targetDifficulty: "medium",
  hasHistory: false,
  exercises: [
    {
      id: "adaptive-fallback-1",
      prompt: "Explique com suas palavras o conceito central do tema atual e dê um exemplo de aplicação.",
      difficulty: "medium",
      expectedAnswer: "Definição fiel ao material acompanhada de exemplo coerente.",
      gradingCriteria: "Verifica clareza conceitual e aderência aos trechos estudados.",
      revealAnswerBeforeAttempt: false,
      sourceRef: "sem apoio no material",
    },
  ],
  progressionNote: "Fallback inicial seguro no nível intermediário padrão até coleta de novas tentativas.",
} satisfies PracticeAdaptiveOutput);

/**
 * Adaptador puro (sem efeitos colaterais) que consulta `AdaptiveAssessmentEngine.recommendTargetDifficulty`.
 */
export function buildAdaptivePracticeSnapshot(input: {
  knowledgeScore?: number;
  recentResults: readonly QuizResult[];
  errorEntries?: readonly ErrorNotebookEntry[];
}): AdaptivePracticeSnapshot {
  const recommendedDifficulty = AdaptiveAssessmentEngine.recommendTargetDifficulty(
    input.knowledgeScore,
    input.recentResults,
  );
  const pendingErrors = (input.errorEntries ?? []).filter((e) => e.status !== "resolved");
  const hasHistory = input.knowledgeScore !== undefined || input.recentResults.length > 0 || pendingErrors.length > 0;
  const contextSummary = [
    `AdaptiveAssessmentEngine: hasHistory=${hasHistory}, recommendedDifficulty=${recommendedDifficulty}, knowledgeScore=${input.knowledgeScore ?? "unknown"}, pendingErrors=${pendingErrors.length}.`,
    ...pendingErrors.slice(0, 3).map((e) => `- Erro pendente: ${e.questionPrompt}`),
  ].join("\n");

  return {
    hasHistory,
    knowledgeScore: input.knowledgeScore,
    recommendedDifficulty,
    pendingErrorCount: pendingErrors.length,
    contextSummary,
  };
}

export function validatePracticeAdaptiveOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: PracticeAdaptiveOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as PracticeAdaptiveOutput;
  } catch {
    return { valid: false, errors: ["A saída de practice.adaptive não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de practice.adaptive deve ser um objeto JSON."] };
  }

  const validDiffs: QuizDifficulty[] = ["easy", "medium", "hard"];
  if (!validDiffs.includes(parsed.targetDifficulty)) {
    errors.push("A propriedade 'targetDifficulty' deve ser 'easy', 'medium' ou 'hard'.");
  }

  if (typeof parsed.hasHistory !== "boolean") {
    errors.push("A propriedade 'hasHistory' deve ser um booleano.");
  }

  if (!Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
    errors.push("A propriedade 'exercises' deve conter ao menos um exercício.");
  } else {
    const seenIds = new Set<string>();
    parsed.exercises.forEach((ex, idx) => {
      if (!ex?.id || seenIds.has(ex.id)) {
        errors.push(`Exercício ${idx + 1} exige um 'id' único não vazio.`);
      } else {
        seenIds.add(ex.id);
      }
      if (!ex?.prompt?.trim() || !ex?.expectedAnswer?.trim() || !ex?.gradingCriteria?.trim()) {
        errors.push(`Exercício ${idx + 1} exige 'prompt', 'expectedAnswer' e 'gradingCriteria' não vazios.`);
      }
      if (!validDiffs.includes(ex?.difficulty)) {
        errors.push(`Exercício ${idx + 1} possui dificuldade inválida "${ex?.difficulty}".`);
      }
      if (ex?.revealAnswerBeforeAttempt !== false) {
        errors.push(`Exercício ${idx + 1} viola o contrato: 'revealAnswerBeforeAttempt' deve ser estritamente false.`);
      }
    });
  }

  if (!parsed.progressionNote || typeof parsed.progressionNote !== "string" || !parsed.progressionNote.trim()) {
    errors.push("A propriedade 'progressionNote' deve conter uma nota de progressão pedagógica.");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

/**
 * Valida a coerência determinística entre a saída da IA e o snapshot do `AdaptiveAssessmentEngine`.
 */
export function validatePracticeAdaptiveAgainstSnapshot(
  parsed: PracticeAdaptiveOutput,
  snapshot: AdaptivePracticeSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (parsed.targetDifficulty !== snapshot.recommendedDifficulty) {
    errors.push(
      `Dificuldade alvo divergente do AdaptiveAssessmentEngine: esperado "${snapshot.recommendedDifficulty}", recebido "${parsed.targetDifficulty}".`,
    );
  }
  if (parsed.hasHistory !== snapshot.hasHistory) {
    errors.push(`Inconsistência em hasHistory: esperado ${snapshot.hasHistory}, recebido ${parsed.hasHistory}.`);
  }
  const alignedCount = parsed.exercises.filter((ex) => ex.difficulty === snapshot.recommendedDifficulty).length;
  if (alignedCount === 0) {
    errors.push(
      `Nenhum exercício retornado corresponde à dificuldade recomendada ("${snapshot.recommendedDifficulty}").`,
    );
  }
  return { valid: errors.length === 0, errors };
}

export const practiceAdaptiveSkillSpec: SkillSpec = {
  id: "practice.adaptive",
  version: "0.1.0",
  objective: "Gerar exercícios adaptados ao nível calculado pelo AdaptiveAssessmentEngine com critérios de correção e sem revelar respostas antes da tentativa.",
  triggers: [
    {
      type: "action",
      value: "adaptive_practice",
      description: "Prática adaptativa de exercícios no módulo de Estudo ou Aprendizagem.",
    },
    {
      type: "intent",
      value: "generate_level_appropriate_exercises",
      description: "Estudante pede exercícios calibrados ao seu nível atual.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        studyId: { type: "string" },
        topic: { type: "string", maxLength: 200 },
        count: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["studyId", "topic"],
    },
    required: ["studyId", "topic"],
  },
  allowedContext: ["study", "chunks", "profile", "errors"],
  allowedTools: ["quiz", "performance"],
  output: {
    type: "json",
    formatDescription:
      "Objeto JSON com targetDifficulty ('easy'|'medium'|'hard'), hasHistory, exercises ([{id, prompt, difficulty, expectedAnswer, gradingCriteria, revealAnswerBeforeAttempt: false, sourceRef?}]) e progressionNote.",
    example: JSON.stringify({
      targetDifficulty: "easy",
      hasHistory: true,
      exercises: [
        {
          id: "ex-1",
          prompt: "Qual é a diferença entre pilha (LIFO) e fila (FIFO)?",
          difficulty: "easy",
          expectedAnswer: "Pilha remove o último inserido; fila remove o primeiro inserido.",
          gradingCriteria: "Deve citar corretamente a ordem de remoção em ambas as estruturas.",
          revealAnswerBeforeAttempt: false,
          sourceRef: "Estruturas de Dados · p. 15",
        },
      ],
      progressionNote: "Nível fácil mantido para consolidar fundamentos antes de avançar.",
    }),
    requiredKeys: ["targetDifficulty", "hasHistory", "exercises", "progressionNote"],
    validator: validatePracticeAdaptiveOutput,
  },
  tokenBudget: {
    input: 2500,
    output: 800,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    requiresContextualValidation: true,
    forbiddenOutputs: [
      "alteração automática do perfil do estudante",
      "notas ou histórico de desempenho inventados",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Respeita estritamente a dificuldade calculada pelo AdaptiveAssessmentEngine",
      "Mantém revealAnswerBeforeAttempt=false em todos os exercícios",
      "Inclui expectedAnswer e gradingCriteria claros em cada questão",
    ],
    maxOutputWords: 550,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: PRACTICE_ADAPTIVE_FALLBACK_JSON,
    description: "Exercício conservador válido em JSON para contingência sem revelar resposta antecipada.",
  },
};
