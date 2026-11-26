/**
 * StudyAI — Intelligence Engine (IE-4B)
 * Especificação pedagógica: plan.study (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#14):
 * - Objetivo: Plano com metas e prioridades.
 * - Base existente: `planning/PlanningEngine.ts` (motor determinístico permanece fonte de verdade).
 * - Ferramentas (fase): `plan` (declarativo até Onda 3).
 * - Orçamento inicial: 2.000 entrada / 700 saída.
 *
 * Sem efeitos colaterais: nunca modifica planos persistidos nem cria eventos externos.
 */

import { PlanningEngine, type PlanningSignalInput } from "@/features/planning/PlanningEngine";
import type { StudyPlan, StudyPlanConfig } from "@/features/planning/types";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface PlanStudySession {
  readonly dayOffset: number;
  readonly dateStr: string;
  readonly studyId: string;
  readonly title: string;
  readonly minutes: number;
  readonly priority: "high" | "medium" | "low";
  /** Diferencia itens calculados pelo PlanningEngine de sugestões pedagógicas da IA. */
  readonly source: "engine" | "suggestion";
  readonly rationale: string;
  readonly completionCriteria: string;
}

export interface PlanStudyOutput {
  readonly goal: string;
  readonly dailyMinutesLimit: number;
  readonly horizonDays: number;
  readonly sessions: readonly PlanStudySession[];
  readonly reviewCheckpoints: readonly string[];
}

export const PLAN_STUDY_FALLBACK_JSON = JSON.stringify({
  goal: "Organizar sessões curtas e revisões prioritárias dentro do tempo disponível.",
  dailyMinutesLimit: 60,
  horizonDays: 7,
  sessions: [
    {
      dayOffset: 0,
      dateStr: "dia-0",
      studyId: "estudo-atual",
      title: "Revisão orientada do tema prioritário",
      minutes: 30,
      priority: "high",
      source: "suggestion",
      rationale: "Fallback conservador respeitando o limite diário sem alterar planos salvos.",
      completionCriteria: "Concluir leitura ativa e anotar 3 dúvidas principais.",
    },
  ],
  reviewCheckpoints: ["Verificar progresso ao final do ciclo e ajustar prioridades no Planejamento."],
} satisfies PlanStudyOutput);

/**
 * Adaptador puro (sem efeitos colaterais) que executa o `PlanningEngine` existente
 * e devolve um snapshot determinístico para contextualizar `plan.study`.
 */
export function buildDeterministicPlanSnapshot(
  partialConfig: Partial<StudyPlanConfig>,
  signals: PlanningSignalInput,
  existingPlan?: StudyPlan | null,
): { plan: StudyPlan; contextSummary: string } {
  const plan = PlanningEngine.generate(partialConfig, signals, existingPlan);
  const lines = [
    `Plano determinístico (PlanningEngine): meta="${plan.goal || plan.title}", limiteDiario=${plan.dailyMinutes}min, horizonte=${plan.horizonDays} dias.`,
    ...plan.items.map(
      (item) =>
        `- [dayOffset=${item.dayOffset} ${item.dateStr}] studyId=${item.studyId} | ${item.title} | ${item.estimatedMinutes}min | priority=${item.priority}`,
    ),
  ];
  return { plan, contextSummary: lines.join("\n") };
}

export function validatePlanStudyOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: PlanStudyOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as PlanStudyOutput;
  } catch {
    return { valid: false, errors: ["A saída de plan.study não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de plan.study deve ser um objeto JSON."] };
  }

  if (!parsed.goal || typeof parsed.goal !== "string" || !parsed.goal.trim()) {
    errors.push("A propriedade 'goal' deve declarar a meta do plano.");
  }

  if (typeof parsed.dailyMinutesLimit !== "number" || !Number.isFinite(parsed.dailyMinutesLimit) || parsed.dailyMinutesLimit <= 0) {
    errors.push("A propriedade 'dailyMinutesLimit' deve ser um número positivo.");
  }

  if (typeof parsed.horizonDays !== "number" || !Number.isInteger(parsed.horizonDays) || parsed.horizonDays < 1) {
    errors.push("A propriedade 'horizonDays' deve ser um inteiro positivo.");
  }

  if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
    errors.push("A propriedade 'sessions' deve conter ao menos uma sessão planejada.");
  } else {
    const minutesByDay = new Map<number, number>();
    const validPriorities = ["high", "medium", "low"];
    parsed.sessions.forEach((s, idx) => {
      if (typeof s?.dayOffset !== "number" || !Number.isInteger(s.dayOffset) || s.dayOffset < 0) {
        errors.push(`Sessão ${idx + 1} possui 'dayOffset' inválido.`);
      } else if (typeof parsed?.horizonDays === "number" && s.dayOffset >= parsed.horizonDays) {
        errors.push(`Sessão ${idx + 1} excede horizonDays (${s.dayOffset} >= ${parsed.horizonDays}).`);
      }

      if (typeof s?.minutes !== "number" || !Number.isFinite(s.minutes) || s.minutes <= 0) {
        errors.push(`Sessão ${idx + 1} deve ter 'minutes' positivo.`);
      } else if (typeof s?.dayOffset === "number") {
        minutesByDay.set(s.dayOffset, (minutesByDay.get(s.dayOffset) ?? 0) + s.minutes);
      }

      if (!s?.studyId || !s?.title || !s?.rationale || !s?.completionCriteria) {
        errors.push(`Sessão ${idx + 1} exige 'studyId', 'title', 'rationale' e 'completionCriteria'.`);
      }
      if (!validPriorities.includes(s?.priority)) {
        errors.push(`Sessão ${idx + 1} possui prioridade inválida "${s?.priority}".`);
      }
      if (s?.source !== "engine" && s?.source !== "suggestion") {
        errors.push(`Sessão ${idx + 1} deve indicar source 'engine' ou 'suggestion'.`);
      }
    });

    if (typeof parsed.dailyMinutesLimit === "number" && parsed.dailyMinutesLimit > 0) {
      for (const [day, totalMinutes] of minutesByDay.entries()) {
        if (totalMinutes > parsed.dailyMinutesLimit) {
          errors.push(
            `Dia ${day} excedeu a disponibilidade diária máxima (${totalMinutes}min > ${parsed.dailyMinutesLimit}min).`,
          );
        }
      }
    }
  }

  if (!Array.isArray(parsed.reviewCheckpoints) || parsed.reviewCheckpoints.length === 0) {
    errors.push("A propriedade 'reviewCheckpoints' deve conter ao menos um ponto de revisão.");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

/**
 * Validação determinística adicional contra as restrições explícitas fornecidas na entrada
 * (evita que a IA eleve `dailyMinutesLimit` ou `horizonDays` acima do pedido do aluno).
 */
export function validatePlanStudyAgainstConstraints(
  parsed: PlanStudyOutput,
  constraints: { dailyMinutes: number; horizonDays: number; allowedStudyIds?: readonly string[] },
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (parsed.dailyMinutesLimit > constraints.dailyMinutes) {
    errors.push(
      `Plano extrapolou a disponibilidade diária explícita (${parsed.dailyMinutesLimit}min > ${constraints.dailyMinutes}min).`,
    );
  }
  if (parsed.horizonDays > constraints.horizonDays) {
    errors.push(`Plano extrapolou o horizonte explícito (${parsed.horizonDays} > ${constraints.horizonDays} dias).`);
  }
  if (constraints.allowedStudyIds && constraints.allowedStudyIds.length > 0) {
    const allowed = new Set(constraints.allowedStudyIds);
    parsed.sessions.forEach((s, idx) => {
      if (!allowed.has(s.studyId)) {
        errors.push(`Sessão ${idx + 1} referencia studyId "${s.studyId}" não autorizado/inexistente no contexto.`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

export const planStudySkillSpec: SkillSpec = {
  id: "plan.study",
  version: "0.1.0",
  objective: "Estruturar um plano de estudos com metas, prioridades, revisões e critérios de conclusão respeitando os cálculos do PlanningEngine e a disponibilidade explícita.",
  triggers: [
    {
      type: "action",
      value: "study_plan",
      description: "Geração ou explicação de plano de estudos no módulo de Planejamento.",
    },
    {
      type: "intent",
      value: "organize_study_schedule",
      description: "Estudante pede ajuda para organizar metas, prazos e sessões de estudo.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        goal: { type: "string", maxLength: 240 },
        dailyMinutes: { type: "integer", minimum: 15, maximum: 600 },
        horizonDays: { type: "integer", minimum: 1, maximum: 30 },
        referenceDate: { type: "string" },
      },
      required: ["goal", "dailyMinutes", "horizonDays"],
    },
    required: ["goal", "dailyMinutes", "horizonDays"],
  },
  allowedContext: ["study", "profile", "errors"],
  allowedTools: ["plan"],
  output: {
    type: "json",
    formatDescription:
      "Objeto JSON com goal, dailyMinutesLimit, horizonDays, sessions ([{dayOffset, dateStr, studyId, title, minutes, priority, source, rationale, completionCriteria}]) e reviewCheckpoints.",
    example: JSON.stringify({
      goal: "Consolidar Grafos para a prova em 5 dias",
      dailyMinutesLimit: 60,
      horizonDays: 5,
      sessions: [
        {
          dayOffset: 0,
          dateStr: "2026-11-26",
          studyId: "study-grafos",
          title: "Revisar busca em largura (BFS)",
          minutes: 30,
          priority: "high",
          source: "engine",
          rationale: "Prioridade calculada pelo PlanningEngine devido à prova próxima.",
          completionCriteria: "Resolver 2 exercícios de percurso BFS sem consulta.",
        },
      ],
      reviewCheckpoints: ["Dia 3: simulado curto de BFS e DFS."],
    }),
    requiredKeys: ["goal", "dailyMinutesLimit", "horizonDays", "sessions", "reviewCheckpoints"],
    validator: validatePlanStudyOutput,
  },
  tokenBudget: {
    input: 2000,
    output: 700,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "modificação automática de planos persistidos",
      "compromissos ou matérias inventadas",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Soma de minutos por dia nunca excede dailyMinutesLimit",
      "Diferencia explicitamente itens do PlanningEngine ('engine') de sugestões pedagógicas ('suggestion')",
      "Nunca inventa matérias, prazos ou altera planos salvos automaticamente",
    ],
    maxOutputWords: 450,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: PLAN_STUDY_FALLBACK_JSON,
    description: "Plano conservador válido em JSON respeitando limites seguros sem efeitos colaterais.",
  },
};
