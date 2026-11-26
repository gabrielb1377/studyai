/**
 * StudyAI — Intelligence Engine (IE-4B)
 * Especificação pedagógica: technique.spaced-repetition (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#4):
 * - Objetivo: Escolher o que revisar hoje e explicar por quê.
 * - Base existente: `learning/ReviewScheduler.ts` (SM-2) e `learning/TopicReview.ts`.
 * - Ferramentas (fase): `performance` (declarativo até Onda 3).
 * - Orçamento inicial: 1.500 entrada / 400 saída.
 *
 * O motor determinístico (`ReviewScheduler` + `reviewPeriod`) é a única fonte de verdade
 * para datas, intervalos, atrasos e prioridades. A skill não duplica SM-2 e nunca marca
 * revisões como concluídas.
 */

import { ReviewScheduler } from "@/features/learning/ReviewScheduler";
import { reviewPeriod, type TopicReview } from "@/features/learning/TopicReview";
import type { Flashcard } from "@/types/flashcard";
import type { SkillSpec, SkillValidationResult } from "../types";

export type SpacedRepetitionPeriod = "late" | "today" | "upcoming" | "new";

export interface DeterministicReviewItem {
  readonly topicId: string;
  readonly title: string;
  readonly period: SpacedRepetitionPeriod;
  readonly nextReviewAt?: string;
  readonly sourceType: "topic_review" | "flashcard";
}

export interface SpacedRepetitionSnapshot {
  readonly referenceDate: string;
  readonly hasHistory: boolean;
  readonly items: readonly DeterministicReviewItem[];
  readonly contextSummary: string;
}

export interface SpacedRepetitionQueueItem {
  readonly topicId: string;
  readonly title: string;
  readonly period: SpacedRepetitionPeriod;
  readonly nextReviewAt?: string;
  readonly whyToday: string;
}

export interface SpacedRepetitionOutput {
  readonly referenceDate: string;
  readonly hasHistory: boolean;
  readonly todayQueue: readonly SpacedRepetitionQueueItem[];
  readonly pedagogicalTip: string;
}

export const SPACED_REPETITION_FALLBACK_JSON = JSON.stringify({
  referenceDate: "1970-01-01",
  hasHistory: false,
  todayQueue: [],
  pedagogicalTip:
    "Inicie uma primeira revisão curta dos seus tópicos principais para que o agendador SM-2 calcule os próximos intervalos.",
} satisfies SpacedRepetitionOutput);

/**
 * Constrói um snapshot 100% determinístico a partir de `TopicReview` e `Flashcard`
 * usando uma data de referência fixa (evita dependência do relógio real e de fuso).
 * Sem efeitos colaterais: não altera nem conclui nenhuma revisão.
 */
export function buildSpacedRepetitionSnapshot(
  topicReviews: readonly TopicReview[],
  flashcards: readonly Flashcard[],
  referenceDateIso: string,
): SpacedRepetitionSnapshot {
  const refDate = new Date(referenceDateIso);
  const items: DeterministicReviewItem[] = [];

  for (const tr of topicReviews) {
    const period = reviewPeriod(tr.nextReviewAt, refDate);
    items.push({
      topicId: `${tr.studyId}:${tr.topic}`,
      title: tr.topic,
      period,
      nextReviewAt: tr.nextReviewAt,
      sourceType: "topic_review",
    });
  }

  for (const card of flashcards) {
    const isDue = ReviewScheduler.isDue(card, refDate);
    const period: SpacedRepetitionPeriod = !card.nextReviewAt
      ? "new"
      : isDue
        ? reviewPeriod(card.nextReviewAt, refDate)
        : "upcoming";
    items.push({
      topicId: `card:${card.id}`,
      title: card.question,
      period,
      nextReviewAt: card.nextReviewAt,
      sourceType: "flashcard",
    });
  }

  const priorityOrder: Record<SpacedRepetitionPeriod, number> = { late: 0, today: 1, new: 2, upcoming: 3 };
  items.sort((a, b) => priorityOrder[a.period] - priorityOrder[b.period]);

  const hasHistory = topicReviews.length > 0 || flashcards.some((c) => Boolean(c.lastReviewedAt || c.nextReviewAt));
  const lines = [
    `Data de referência: ${referenceDateIso} | hasHistory=${hasHistory}`,
    ...(items.length > 0
      ? items.map((i) => `- topicId=${i.topicId} | title="${i.title}" | period=${i.period} | nextReviewAt=${i.nextReviewAt ?? "none"}`)
      : ["- Sem itens com histórico de revisão registrado."]),
  ];

  return {
    referenceDate: referenceDateIso,
    hasHistory,
    items,
    contextSummary: lines.join("\n"),
  };
}

export function validateSpacedRepetitionOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: SpacedRepetitionOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as SpacedRepetitionOutput;
  } catch {
    return { valid: false, errors: ["A saída de technique.spaced-repetition não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de technique.spaced-repetition deve ser um objeto JSON."] };
  }

  if (!parsed.referenceDate || typeof parsed.referenceDate !== "string") {
    errors.push("A propriedade 'referenceDate' deve conter a data de referência.");
  }

  if (typeof parsed.hasHistory !== "boolean") {
    errors.push("A propriedade 'hasHistory' deve ser um booleano.");
  }

  if (!Array.isArray(parsed.todayQueue)) {
    errors.push("A propriedade 'todayQueue' deve ser uma lista de tópicos recomendados.");
  } else {
    const validPeriods: SpacedRepetitionPeriod[] = ["late", "today", "upcoming", "new"];
    parsed.todayQueue.forEach((item, idx) => {
      if (!item?.topicId || !item?.title || !item?.whyToday) {
        errors.push(`Item ${idx + 1} da fila exige 'topicId', 'title' e 'whyToday'.`);
      }
      if (!validPeriods.includes(item?.period)) {
        errors.push(`Item ${idx + 1} possui period inválido "${item?.period}".`);
      }
    });
  }

  if (!parsed.pedagogicalTip || typeof parsed.pedagogicalTip !== "string" || !parsed.pedagogicalTip.trim()) {
    errors.push("A propriedade 'pedagogicalTip' deve conter uma orientação pedagógica não vazia.");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

/**
 * Garante que a recomendação da IA não inventa tópicos inexistentes nem contradiz
 * as datas/períodos calculados deterministicamente por `ReviewScheduler` e `TopicReview`.
 */
export function validateSpacedRepetitionAgainstSnapshot(
  parsed: SpacedRepetitionOutput,
  snapshot: SpacedRepetitionSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map(snapshot.items.map((item) => [item.topicId, item]));

  if (parsed.hasHistory !== snapshot.hasHistory) {
    errors.push(`Inconsistência de histórico: esperado hasHistory=${snapshot.hasHistory}, recebido ${parsed.hasHistory}.`);
  }

  parsed.todayQueue.forEach((item, idx) => {
    const official = byId.get(item.topicId);
    if (!official) {
      errors.push(`Item ${idx + 1} referencia topicId inventado ou não autorizado: "${item.topicId}".`);
      return;
    }
    if (item.period !== official.period) {
      errors.push(
        `Item ${idx + 1} ("${item.topicId}") divergiu do período determinístico: esperado "${official.period}", recebido "${item.period}".`,
      );
    }
    if (item.nextReviewAt && official.nextReviewAt && item.nextReviewAt !== official.nextReviewAt) {
      errors.push(
        `Item ${idx + 1} ("${item.topicId}") alterou nextReviewAt determinístico (${item.nextReviewAt} != ${official.nextReviewAt}).`,
      );
    }
  });

  return { valid: errors.length === 0, errors };
}

export const spacedRepetitionSkillSpec: SkillSpec = {
  id: "technique.spaced-repetition",
  version: "0.1.0",
  objective: "Escolher o que revisar hoje com base no agendador determinístico (SM-2 / TopicReview) e explicar pedagogicamente o porquê da prioridade.",
  triggers: [
    {
      type: "action",
      value: "spaced_repetition_today",
      description: "Ação de revisão diária baseada em repetição espaçada.",
    },
    {
      type: "intent",
      value: "what_to_review_today",
      description: "Estudante pergunta o que deve revisar hoje e por quê.",
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
  allowedTools: ["performance"],
  output: {
    type: "json",
    formatDescription:
      "Objeto JSON com referenceDate, hasHistory, todayQueue ([{topicId, title, period, nextReviewAt?, whyToday}]) e pedagogicalTip.",
    example: JSON.stringify({
      referenceDate: "2026-11-26T12:00:00.000Z",
      hasHistory: true,
      todayQueue: [
        {
          topicId: "study-ed:Árvores Rubro-Negras",
          title: "Árvores Rubro-Negras",
          period: "late",
          nextReviewAt: "2026-11-24T12:00:00.000Z",
          whyToday: "Revisão atrasada há 2 dias segundo o agendador; retomar agora reduz a curva de esquecimento.",
        },
      ],
      pedagogicalTip: "Priorize primeiro os itens atrasados antes de avançar para revisões futuras.",
    }),
    requiredKeys: ["referenceDate", "hasHistory", "todayQueue", "pedagogicalTip"],
    validator: validateSpacedRepetitionOutput,
  },
  tokenBudget: {
    input: 1500,
    output: 400,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    requiresContextualValidation: true,
    forbiddenOutputs: [
      "revisões inventadas fora do histórico",
      "conclusão automática de revisões",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Preserva integralmente topicId, period e nextReviewAt do ReviewScheduler / TopicReview",
      "Não inventa notas, intervalos nem marca revisões como concluídas",
      "Trata estudante sem histórico com orientação inicial clara",
    ],
    maxOutputWords: 260,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: SPACED_REPETITION_FALLBACK_JSON,
    description: "Orientação segura em JSON quando não há histórico ou a saída viola o contrato.",
  },
};
