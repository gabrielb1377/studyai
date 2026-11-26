/**
 * StudyAI — Intelligence Engine (IE-4C)
 * Especificação pedagógica: exam.preparation (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#9):
 * - Objetivo: Plano e simulado para uma avaliação.
 * - Base existente: `planning/PlanningEngine.ts` e Semana de Prova (`ExamService.daysUntilExam`).
 * - Ferramentas (fase): `plan`, `quiz` (declarativas até Onda 3).
 * - Orçamento inicial: 2.500 entrada / 800 saída.
 *
 * Sem efeitos colaterais: não cria provas persistidas, não inicia sessões nem
 * modifica planos salvos. Nunca apresenta questões geradas pela IA como provas
 * reais de instituições externas (`generatedByAI: true` obrigatório).
 */

import { daysUntilExam } from "@/features/exam/ExamService";
import { PlanningEngine, type PlanningSignalInput } from "@/features/planning/PlanningEngine";
import type { StudyPlan, StudyPlanConfig } from "@/features/planning/types";
import type { Exam } from "@/types/exam";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface ExamPreparationSnapshot {
  readonly examId: string;
  readonly examTitle: string;
  readonly examDate: string;
  readonly daysLeft: number;
  readonly dailyMinutes: number;
  readonly authorizedSubjects: readonly string[];
  readonly plan: StudyPlan;
  readonly contextSummary: string;
}

export interface ExamPrepScheduleItem {
  readonly dayOffset: number;
  readonly dateStr: string;
  readonly subject: string;
  readonly minutes: number;
  readonly priority: "high" | "medium" | "low";
  readonly source: "engine" | "suggestion";
  readonly focus: string;
}

export interface ExamMockQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly expectedAnswer: string;
  readonly gradingCriteria: string;
  /** Deve ser sempre true: questões geradas nunca são apresentadas como questões reais de banca externa. */
  readonly generatedByAI: boolean;
}

export interface ExamPreparationOutput {
  readonly examTitle: string;
  readonly examDate: string;
  readonly daysLeft: number;
  readonly dailyMinutesLimit: number;
  readonly studySchedule: readonly ExamPrepScheduleItem[];
  readonly mockQuestions: readonly ExamMockQuestion[];
  readonly readinessCriteria: readonly string[];
}

export const EXAM_PREPARATION_FALLBACK_JSON = JSON.stringify({
  examTitle: "Avaliação planejada",
  examDate: "2026-12-01",
  daysLeft: 5,
  dailyMinutesLimit: 60,
  studySchedule: [
    {
      dayOffset: 0,
      dateStr: "dia-0",
      subject: "Revisão geral dos tópicos pendentes",
      minutes: 30,
      priority: "high",
      source: "suggestion",
      focus: "Consolidar conceitos fundamentais a partir dos materiais da prova.",
    },
  ],
  mockQuestions: [
    {
      id: "exam-mock-fallback-1",
      prompt: "Resuma os 3 conceitos mais importantes cobrados nesta disciplina e um erro comum a evitar.",
      expectedAnswer: "Síntese coerente com o material da avaliação.",
      gradingCriteria: "Avalia cobertura dos tópicos centrais e precisão conceitual.",
      generatedByAI: true,
    },
  ],
  readinessCriteria: ["Revisar checklist de assuntos da prova sem ultrapassar o tempo diário disponível."],
} satisfies ExamPreparationOutput);

/**
 * Adaptador puro que combina `daysUntilExam` (Semana de Prova) e `PlanningEngine.generate`
 * sem alterar provas ou planos persistidos.
 */
export function buildExamPreparationSnapshot(input: {
  exam: Exam;
  partialConfig: Partial<StudyPlanConfig>;
  signals: PlanningSignalInput;
}): ExamPreparationSnapshot {
  const now = input.signals.now ?? new Date();
  const daysLeft = Math.max(0, daysUntilExam(input.exam.examDate, now) ?? 0);
  const plan = PlanningEngine.generate(
    { ...input.partialConfig, includeExams: true, preferredFocus: "exams" },
    { ...input.signals, exams: [input.exam], now },
  );
  const authorizedSubjects = input.exam.subjects.map((s) => s.name);
  const contextSummary = [
    `Semana de Prova: examTitle="${input.exam.title}", examDate=${input.exam.examDate}, daysLeft=${daysLeft}, dailyMinutes=${plan.dailyMinutes}.`,
    `Assuntos autorizados: ${authorizedSubjects.join(", ") || input.exam.discipline}.`,
    ...plan.items.map(
      (item) => `- [dayOffset=${item.dayOffset} ${item.dateStr}] ${item.title} | ${item.estimatedMinutes}min | priority=${item.priority}`,
    ),
  ].join("\n");

  return {
    examId: input.exam.id,
    examTitle: input.exam.title,
    examDate: input.exam.examDate,
    daysLeft,
    dailyMinutes: plan.dailyMinutes,
    authorizedSubjects,
    plan,
    contextSummary,
  };
}

export function validateExamPreparationOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: ExamPreparationOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as ExamPreparationOutput;
  } catch {
    return { valid: false, errors: ["A saída de exam.preparation não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de exam.preparation deve ser um objeto JSON."] };
  }

  if (!parsed.examTitle?.trim() || !parsed.examDate?.trim()) {
    errors.push("As propriedades 'examTitle' e 'examDate' são obrigatórias.");
  }

  if (typeof parsed.daysLeft !== "number" || !Number.isInteger(parsed.daysLeft) || parsed.daysLeft < 0) {
    errors.push("A propriedade 'daysLeft' deve ser um inteiro >= 0.");
  }

  if (typeof parsed.dailyMinutesLimit !== "number" || !Number.isFinite(parsed.dailyMinutesLimit) || parsed.dailyMinutesLimit <= 0) {
    errors.push("A propriedade 'dailyMinutesLimit' deve ser um número positivo.");
  }

  if (!Array.isArray(parsed.studySchedule) || parsed.studySchedule.length === 0) {
    errors.push("A propriedade 'studySchedule' deve conter ao menos uma sessão de preparação.");
  } else {
    const minutesByDay = new Map<number, number>();
    const validPriorities = ["high", "medium", "low"];
    parsed.studySchedule.forEach((item, idx) => {
      if (typeof item?.dayOffset !== "number" || !Number.isInteger(item.dayOffset) || item.dayOffset < 0) {
        errors.push(`Sessão ${idx + 1} possui 'dayOffset' inválido.`);
      }
      if (typeof item?.minutes !== "number" || !Number.isFinite(item.minutes) || item.minutes <= 0) {
        errors.push(`Sessão ${idx + 1} deve ter 'minutes' positivo.`);
      } else if (typeof item?.dayOffset === "number") {
        minutesByDay.set(item.dayOffset, (minutesByDay.get(item.dayOffset) ?? 0) + item.minutes);
      }
      if (!item?.subject?.trim() || !item?.focus?.trim()) {
        errors.push(`Sessão ${idx + 1} exige 'subject' e 'focus' não vazios.`);
      }
      if (!validPriorities.includes(item?.priority)) {
        errors.push(`Sessão ${idx + 1} possui prioridade inválida "${item?.priority}".`);
      }
      if (item?.source !== "engine" && item?.source !== "suggestion") {
        errors.push(`Sessão ${idx + 1} deve indicar source 'engine' ou 'suggestion'.`);
      }
    });

    if (typeof parsed.dailyMinutesLimit === "number" && parsed.dailyMinutesLimit > 0) {
      for (const [day, total] of minutesByDay.entries()) {
        if (total > parsed.dailyMinutesLimit) {
          errors.push(`Dia ${day} excedeu a disponibilidade diária (${total}min > ${parsed.dailyMinutesLimit}min).`);
        }
      }
    }
  }

  if (!Array.isArray(parsed.mockQuestions) || parsed.mockQuestions.length === 0) {
    errors.push("A propriedade 'mockQuestions' deve conter ao menos uma questão de simulado direcionado.");
  } else {
    const seenIds = new Set<string>();
    parsed.mockQuestions.forEach((q, idx) => {
      if (!q?.id || seenIds.has(q.id)) {
        errors.push(`Questão ${idx + 1} do simulado exige 'id' único.`);
      } else {
        seenIds.add(q.id);
      }
      if (!q?.prompt?.trim() || !q?.expectedAnswer?.trim() || !q?.gradingCriteria?.trim()) {
        errors.push(`Questão ${idx + 1} do simulado exige 'prompt', 'expectedAnswer' e 'gradingCriteria'.`);
      }
      if (q?.generatedByAI !== true) {
        errors.push(`Questão ${idx + 1} do simulado deve marcar generatedByAI=true (nunca simular questão oficial de banca externa).`);
      }
    });
  }

  if (!Array.isArray(parsed.readinessCriteria) || parsed.readinessCriteria.length === 0) {
    errors.push("A propriedade 'readinessCriteria' deve conter critérios objetivos de preparação.");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

/**
 * Valida a saída contra os dados reais da prova e do `PlanningEngine`.
 */
export function validateExamPreparationAgainstSnapshot(
  parsed: ExamPreparationOutput,
  snapshot: ExamPreparationSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (parsed.examDate !== snapshot.examDate) {
    errors.push(`Data da prova alterada indevidamente: esperado "${snapshot.examDate}", recebido "${parsed.examDate}".`);
  }
  if (parsed.daysLeft !== snapshot.daysLeft) {
    errors.push(`Dias restantes divergentes: esperado ${snapshot.daysLeft}, recebido ${parsed.daysLeft}.`);
  }
  if (parsed.dailyMinutesLimit > snapshot.dailyMinutes) {
    errors.push(`Limite diário excede o autorizado (${parsed.dailyMinutesLimit}min > ${snapshot.dailyMinutes}min).`);
  }
  return { valid: errors.length === 0, errors };
}

export const examPreparationSkillSpec: SkillSpec = {
  id: "exam.preparation",
  version: "0.1.0",
  objective: "Montar plano de preparação e simulado direcionado para uma avaliação reutilizando o PlanningEngine e a Semana de Prova.",
  triggers: [
    {
      type: "action",
      value: "exam_preparation",
      description: "Preparação direcionada para avaliação ativa na Semana de Prova.",
    },
    {
      type: "intent",
      value: "prepare_for_exam",
      description: "Estudante pede plano de revisão e simulado para uma prova próxima.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        examTitle: { type: "string", maxLength: 200 },
        examDate: { type: "string" },
        dailyMinutes: { type: "integer", minimum: 15, maximum: 600 },
        referenceDate: { type: "string" },
      },
      required: ["examTitle", "examDate", "dailyMinutes"],
    },
    required: ["examTitle", "examDate", "dailyMinutes"],
  },
  allowedContext: ["study", "chunks", "profile", "errors"],
  allowedTools: ["plan", "quiz"],
  output: {
    type: "json",
    formatDescription:
      "Objeto JSON com examTitle, examDate, daysLeft, dailyMinutesLimit, studySchedule, mockQuestions (com generatedByAI: true) e readinessCriteria.",
    example: JSON.stringify({
      examTitle: "P1 — Estruturas de Dados",
      examDate: "2026-12-01",
      daysLeft: 5,
      dailyMinutesLimit: 60,
      studySchedule: [
        {
          dayOffset: 0,
          dateStr: "2026-11-26",
          subject: "Árvores Binárias",
          minutes: 40,
          priority: "high",
          source: "engine",
          focus: "Revisar percursos pré-ordem, em-ordem e pós-ordem.",
        },
      ],
      mockQuestions: [
        {
          id: "mq-1",
          prompt: "Qual é a complexidade de busca no pior caso em uma ABB não balanceada?",
          expectedAnswer: "O(n), quando a árvore degenera em lista encadeada.",
          gradingCriteria: "Deve indicar O(n) e explicar a condição de degeneração.",
          generatedByAI: true,
        },
      ],
      readinessCriteria: ["Acertar >= 80% das questões de revisão sobre árvores e hash."],
    }),
    requiredKeys: ["examTitle", "examDate", "daysLeft", "dailyMinutesLimit", "studySchedule", "mockQuestions", "readinessCriteria"],
    validator: validateExamPreparationOutput,
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
      "questão oficial de prova anterior inventada",
      "criação automática de provas persistidas",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Preserva examDate, daysLeft e dailyMinutesLimit do PlanningEngine / Semana de Prova",
      "Soma diária de minutos nunca ultrapassa dailyMinutesLimit",
      "Todas as questões de simulado declaram generatedByAI=true",
    ],
    maxOutputWords: 550,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: EXAM_PREPARATION_FALLBACK_JSON,
    description: "Plano e simulado conservadores válidos em JSON sem efeitos persistentes.",
  },
};
