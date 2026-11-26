/**
 * StudyAI — Intelligence Engine (IE-4D)
 * Especificação pedagógica: feedback.personal (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#17):
 * - Objetivo: Feedback sobre uma resposta/desempenho, citando o que acertou e o que corrigir.
 * - Base existente: `app/api/lab/review`, correção do Teacher e Learning Engine (`DifficultyMapEngine`, `KnowledgeEngine`).
 * - Ferramentas (fase): `errors` (declarativo até Onda 3).
 * - Orçamento inicial: 2.500 entrada / 600 saída.
 *
 * Regras de integridade:
 * - Diferencia explicitamente resultado observado, interpretação pedagógica, recomendação e evidência insuficiente.
 * - Nunca inventa notas, acertos, erros, histórico ou tópicos fora do snapshot autorizado.
 * - Nunca infere traços psicológicos/pessoais sem dados autorizados e necessidade pedagógica.
 * - Nunca classifica ausência de dados como baixo desempenho.
 * - Não altera perfis, resultados ou registros de avaliação persistidos.
 */

import {
  DifficultyMapEngine,
  type DifficultyMapInput,
  type DifficultyMapItem,
} from "@/features/learning/errors/DifficultyMapEngine";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface PersonalFeedbackSnapshot {
  readonly hasHistory: boolean;
  readonly hasDirectAnswerEvidence: boolean;
  readonly dataSufficiency: "sufficient" | "insufficient";
  readonly items: readonly DifficultyMapItem[];
  readonly authorizedStudyIds: readonly string[];
  readonly authorizedTopics: readonly string[];
  readonly contextSummary: string;
}

export interface FeedbackObservedResult {
  readonly studyId?: string;
  readonly topic: string;
  readonly metricSummary: string;
  readonly knowledgeScore?: number;
  readonly pendingErrorsCount?: number;
}

export interface FeedbackEvidencePoint {
  readonly point: string;
  readonly evidence: string;
}

export interface FeedbackRecommendation {
  readonly action: string;
  readonly rationale: string;
  readonly proportionalToLevel: "foundational" | "consolidation" | "advancement";
}

export interface FeedbackPersonalOutput {
  readonly hasHistory: boolean;
  readonly dataSufficiency: "sufficient" | "insufficient";
  readonly observedResults: readonly FeedbackObservedResult[];
  readonly strengths: readonly FeedbackEvidencePoint[];
  readonly difficulties: readonly FeedbackEvidencePoint[];
  readonly pedagogicalInterpretation: string;
  readonly recommendations: readonly FeedbackRecommendation[];
  readonly nextSteps: readonly string[];
}

export const FEEDBACK_PERSONAL_FALLBACK_JSON = JSON.stringify({
  hasHistory: false,
  dataSufficiency: "insufficient",
  observedResults: [],
  strengths: [],
  difficulties: [],
  pedagogicalInterpretation:
    "Ainda não há evidências suficientes de respostas ou avaliações registradas para emitir feedback personalizado fundamentado.",
  recommendations: [
    {
      action: "Concluir uma tentativa diagnóstica ou enviar uma resposta completa sobre o tema estudado.",
      rationale: "Sem dados observados, o feedback deve aguardar evidências reais antes de classificar domínio ou dificuldade.",
      proportionalToLevel: "foundational",
    },
  ],
  nextSteps: ["Realizar um exercício curto do tema atual para gerar evidências de desempenho."],
} satisfies FeedbackPersonalOutput);

const DISALLOWED_PSYCHOLOGICAL_INFERENCE =
  /\b(tdah|autism\w*|depress[aã]o|ansiedade cl[ií]nica|transtorno|baixo qi|pregui[cç]os\w*|incapaz|burr\w*|falta de intelig[eê]ncia)\b/i;

const LOW_PERFORMANCE_CLAIM_ON_NO_DATA =
  /\b(baixo desempenho|desempenho cr[ií]tico|reprovad\w*|dom[ií]nio insuficiente|fracasso)\b/i;

/**
 * Adaptador puro (sem efeitos colaterais) que lê o estado real do estudante via `DifficultyMapEngine.build`.
 */
export function buildPersonalFeedbackSnapshot(
  input: DifficultyMapInput & {
    readonly studentAnswer?: string;
    readonly targetTopic?: string;
  },
): PersonalFeedbackSnapshot {
  const { items } = DifficultyMapEngine.build(input);
  const hasHistory = items.some((item) => item.level !== "insufficient_data");
  const hasDirectAnswerEvidence = Boolean(input.studentAnswer && input.studentAnswer.trim().length > 0);
  const dataSufficiency: "sufficient" | "insufficient" =
    hasHistory || hasDirectAnswerEvidence ? "sufficient" : "insufficient";

  const authorizedStudyIds = items.map((item) => item.study.studyId);
  const topicSet = new Set<string>();
  for (const item of items) {
    topicSet.add(item.study.title);
    if (item.study.detectedTopic) topicSet.add(item.study.detectedTopic);
  }
  if (input.targetTopic && input.targetTopic.trim().length > 0) {
    topicSet.add(input.targetTopic.trim());
  }
  const authorizedTopics = Array.from(topicSet);

  const lines = [
    `LearningEngine: hasHistory=${hasHistory}, hasDirectAnswer=${hasDirectAnswerEvidence}, dataSufficiency=${dataSufficiency}.`,
    ...(items.length > 0
      ? items.map(
          (item) =>
            `- studyId=${item.study.studyId} | topic="${item.study.title}" | level=${item.level} | knowledge=${item.knowledge.knowledge}% | pendingErrors=${item.pendingErrorsCount}`,
        )
      : ["- Nenhum estudo com histórico avaliado."]),
  ];

  return {
    hasHistory,
    hasDirectAnswerEvidence,
    dataSufficiency,
    items,
    authorizedStudyIds,
    authorizedTopics,
    contextSummary: lines.join("\n"),
  };
}

export function validateFeedbackPersonalOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: FeedbackPersonalOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as FeedbackPersonalOutput;
  } catch {
    return { valid: false, errors: ["A saída de feedback.personal não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de feedback.personal deve ser um objeto JSON."] };
  }

  if (typeof parsed.hasHistory !== "boolean") {
    errors.push("Campo 'hasHistory' deve ser booleano.");
  }
  if (parsed.dataSufficiency !== "sufficient" && parsed.dataSufficiency !== "insufficient") {
    errors.push("Campo 'dataSufficiency' deve ser 'sufficient' ou 'insufficient'.");
  }
  if (!Array.isArray(parsed.observedResults)) {
    errors.push("Campo 'observedResults' deve ser um array.");
  } else {
    parsed.observedResults.forEach((r, idx) => {
      if (!r || typeof r.topic !== "string" || !r.topic.trim()) {
        errors.push(`observedResults[${idx}] exige 'topic' preenchido.`);
      }
      if (!r || typeof r.metricSummary !== "string" || !r.metricSummary.trim()) {
        errors.push(`observedResults[${idx}] exige 'metricSummary' preenchido.`);
      }
    });
  }

  if (!Array.isArray(parsed.strengths)) {
    errors.push("Campo 'strengths' deve ser um array.");
  } else {
    parsed.strengths.forEach((s, idx) => {
      if (!s || typeof s.point !== "string" || !s.point.trim() || typeof s.evidence !== "string" || !s.evidence.trim()) {
        errors.push(`strengths[${idx}] exige 'point' e 'evidence' sustentados.`);
      }
    });
  }

  if (!Array.isArray(parsed.difficulties)) {
    errors.push("Campo 'difficulties' deve ser um array.");
  } else {
    parsed.difficulties.forEach((d, idx) => {
      if (!d || typeof d.point !== "string" || !d.point.trim() || typeof d.evidence !== "string" || !d.evidence.trim()) {
        errors.push(`difficulties[${idx}] exige 'point' e 'evidence' sustentados.`);
      }
    });
  }

  if (typeof parsed.pedagogicalInterpretation !== "string" || parsed.pedagogicalInterpretation.trim().length < 10) {
    errors.push("Campo 'pedagogicalInterpretation' deve ser preenchido.");
  } else if (DISALLOWED_PSYCHOLOGICAL_INFERENCE.test(parsed.pedagogicalInterpretation)) {
    errors.push("Interpretação pedagógica contém inferência psicológica ou rótulo pessoal não autorizado.");
  }

  if (!Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
    errors.push("Campo 'recommendations' deve conter ao menos uma recomendação.");
  } else {
    parsed.recommendations.forEach((rec, idx) => {
      if (!rec || typeof rec.action !== "string" || !rec.action.trim()) {
        errors.push(`recommendations[${idx}] exige 'action'.`);
      }
      if (!rec || typeof rec.rationale !== "string" || !rec.rationale.trim()) {
        errors.push(`recommendations[${idx}] exige 'rationale'.`);
      }
      if (
        rec?.proportionalToLevel !== "foundational" &&
        rec?.proportionalToLevel !== "consolidation" &&
        rec?.proportionalToLevel !== "advancement"
      ) {
        errors.push(`recommendations[${idx}].proportionalToLevel inválido.`);
      }
    });
  }

  if (!Array.isArray(parsed.nextSteps) || parsed.nextSteps.length === 0) {
    errors.push("Campo 'nextSteps' deve conter ao menos um próximo passo.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validação contextual determinística contra o snapshot autorizado do Learning Engine.
 */
export function validateFeedbackPersonalAgainstSnapshot(
  parsed: FeedbackPersonalOutput,
  snapshot: PersonalFeedbackSnapshot,
): SkillValidationResult {
  const errors: string[] = [];

  if (parsed.hasHistory !== snapshot.hasHistory) {
    errors.push(`Divergência em 'hasHistory': esperado ${snapshot.hasHistory}, recebido ${parsed.hasHistory}.`);
  }
  if (parsed.dataSufficiency !== snapshot.dataSufficiency) {
    errors.push(
      `Divergência em 'dataSufficiency': esperado "${snapshot.dataSufficiency}", recebido "${parsed.dataSufficiency}".`,
    );
  }

  if (snapshot.dataSufficiency === "insufficient") {
    if (parsed.observedResults.length > 0) {
      errors.push("Sem evidências suficientes, 'observedResults' deve permanecer vazio.");
    }
    if (LOW_PERFORMANCE_CLAIM_ON_NO_DATA.test(parsed.pedagogicalInterpretation)) {
      errors.push("Ausência de dados não pode ser classificada como baixo desempenho.");
    }
    return { valid: errors.length === 0, errors };
  }

  const itemsByStudyId = new Map(snapshot.items.map((item) => [item.study.studyId, item]));
  const normalizedTopics = new Set(snapshot.authorizedTopics.map((t) => t.toLocaleLowerCase("pt-BR").trim()));

  parsed.observedResults.forEach((res, idx) => {
    if (res.studyId) {
      const official = itemsByStudyId.get(res.studyId);
      if (!official) {
        errors.push(`observedResults[${idx}] cita studyId não autorizado: "${res.studyId}".`);
        return;
      }
      if (res.knowledgeScore !== undefined && res.knowledgeScore !== official.knowledge.knowledge) {
        errors.push(
          `observedResults[${idx}] fabricou knowledgeScore=${res.knowledgeScore} (oficial=${official.knowledge.knowledge}).`,
        );
      }
      if (res.pendingErrorsCount !== undefined && res.pendingErrorsCount !== official.pendingErrorsCount) {
        errors.push(
          `observedResults[${idx}] fabricou pendingErrorsCount=${res.pendingErrorsCount} (oficial=${official.pendingErrorsCount}).`,
        );
      }
    }

    const normTopic = res.topic.toLocaleLowerCase("pt-BR").trim();
    if (normalizedTopics.size > 0 && !normalizedTopics.has(normTopic)) {
      errors.push(`observedResults[${idx}] cita tópico fora do snapshot autorizado: "${res.topic}".`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export const feedbackPersonalSkillSpec: SkillSpec = {
  id: "feedback.personal",
  version: "0.1.0",
  objective:
    "Fornecer feedback pedagógico específico, construtivo e proporcional ao desempenho real observado, separando evidências, interpretação e recomendações.",
  triggers: [
    {
      type: "action",
      value: "personal_feedback",
      description: "Solicitação de feedback personalizado sobre resposta ou desempenho recente.",
    },
    {
      type: "intent",
      value: "review_student_performance",
      description: "Estudante pede avaliação do que acertou, dificuldades e próximos passos.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        referenceDate: { type: "string" },
        studyId: { type: "string" },
        topic: { type: "string" },
        studentAnswer: { type: "string" },
        feedbackSummary: { type: "string" },
      },
      required: ["referenceDate"],
    },
    required: ["referenceDate"],
  },
  output: {
    type: "json",
    requiredKeys: [
      "hasHistory",
      "dataSufficiency",
      "observedResults",
      "strengths",
      "difficulties",
      "pedagogicalInterpretation",
      "recommendations",
      "nextSteps",
    ],
    formatDescription:
      'JSON estrito: { hasHistory, dataSufficiency, observedResults: [{ studyId?, topic, metricSummary, knowledgeScore?, pendingErrorsCount? }], strengths: [{ point, evidence }], difficulties: [{ point, evidence }], pedagogicalInterpretation, recommendations: [{ action, rationale, proportionalToLevel }], nextSteps: string[] }.',
    validator: validateFeedbackPersonalOutput,
  },
  allowedContext: ["study", "profile", "errors"],
  allowedTools: ["errors"],
  tokenBudget: {
    input: 2500,
    output: 600,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: false,
    requiresContextualValidation: true,
    forbiddenOutputs: [
      "notas ou métricas fabricadas",
      "diagnósticos psicológicos ou rótulos pessoais",
      "alteração automática de perfil ou registros de avaliação",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Separar resultado observado, interpretação pedagógica, recomendação e evidência insuficiente.",
      "Não inventar notas, acertos, erros, histórico ou domínio de tópicos.",
      "Não inferir traços psicológicos ou pessoais sem base pedagógica autorizada.",
      "Não classificar ausência de dados como baixo desempenho.",
    ],
    maxOutputWords: 400,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: FEEDBACK_PERSONAL_FALLBACK_JSON,
    description: "Feedback conservador em JSON indicando evidência insuficiente sem rotular desempenho.",
  },
};
