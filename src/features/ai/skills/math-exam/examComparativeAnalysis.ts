/**
 * StudyAI — Intelligence Engine (IE-4F)
 * Especificação pedagógica: exam.comparative-analysis (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#8):
 * - Objetivo: Comparar provas e apontar padrões cobrados.
 * - Base existente: `exam/ExamService.ts`, `exam/grade`, `LearningProfile` e referências autorizadas da biblioteca.
 * - Ferramentas (fase): `library`, `performance` (estritamente declarativas até Onda 3).
 * - Orçamento inicial: 3.500 entrada / 800 saída.
 *
 * Regras de integridade:
 * - Deduplica provas repetidas e trata ausência de datas / amostra insuficiente (< 2 provas únicas).
 * - Valida IDs de provas, denominadores, contagens e percentuais contra o snapshot determinístico.
 * - Diferencia frequência observada, similaridade temática, interpretação pedagógica e incerteza sobre provas futuras.
 * - Nunca trata frequência histórica como garantia de cobrança futura.
 * - Sem efeitos colaterais: não importa provas, não pesquisa na internet e não altera registros persistidos.
 */

import { parseExamDate } from "@/features/exam/ExamService";
import type { LearningProfile } from "@/features/learning/types";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import type { Exam } from "@/types/exam";
import { validateParsedSourceRefs } from "../pilot/grounding";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface ObservedTopicFrequency {
  readonly topic: string;
  readonly count: number;
  readonly denominator: number;
  readonly percentage: number;
}

export interface ExamComparativeSnapshot {
  readonly totalUniqueExams: number;
  readonly duplicateExamIdsSkipped: readonly string[];
  readonly hasSufficientSample: boolean;
  readonly authorizedExamIds: readonly string[];
  readonly authorizedQuestionIds: readonly string[];
  readonly examsWithValidDate: readonly string[];
  readonly topicFrequencies: readonly ObservedTopicFrequency[];
  readonly contextSummary: string;
}

export interface ComparedExamEntry {
  readonly examId: string;
  readonly title: string;
  readonly examDate?: string;
  readonly dateAvailable: boolean;
}

export interface RecurringExamPattern {
  readonly pattern: string;
  readonly evidenceType: "observed_frequency" | "thematic_similarity";
  readonly supportingExamIds: readonly string[];
}

export interface ExamComparativeAnalysisOutput {
  readonly status: "analyzed" | "insufficient_sample";
  readonly comparedExams: readonly ComparedExamEntry[];
  readonly observedTopics: readonly ObservedTopicFrequency[];
  readonly recurringPatterns: readonly RecurringExamPattern[];
  readonly differencesBetweenExams: readonly string[];
  readonly pedagogicalInterpretation: string;
  readonly recommendations: readonly string[];
  /** Explicita que frequência histórica não garante cobrança em avaliações futuras. */
  readonly futureContentUncertaintyNote: string;
  readonly sourceRefs: readonly string[];
}

export const EXAM_COMPARATIVE_ANALYSIS_FALLBACK_JSON = JSON.stringify({
  status: "insufficient_sample",
  comparedExams: [],
  observedTopics: [],
  recurringPatterns: [],
  differencesBetweenExams: [],
  pedagogicalInterpretation:
    "Amostra insuficiente para análise comparativa confiável: são necessárias ao menos duas avaliações únicas registradas.",
  recommendations: [
    "Cadastrar ou selecionar pelo menos duas avaliações distintas da mesma disciplina antes de comparar padrões recorrentes.",
  ],
  futureContentUncertaintyNote:
    "Frequências históricas indicam tendências observadas no passado e não garantem cobrança em provas futuras.",
  sourceRefs: ["sem apoio no material"],
} satisfies ExamComparativeAnalysisOutput);

const FUTURE_GUARANTEE_CLAIM =
  /\b(garantido\s+que\s+(?:vai\s+)?cair|com\s+certeza\s+(?:vai\s+)?cair|100%\s+de\s+certeza\s+que\s+ser[aá]\s+cobrad)\b/i;

/**
 * Adaptador puro (sem efeitos colaterais) que deduplica provas, valida datas via `parseExamDate`
 * e calcula frequências reais observadas por tópico.
 */
export function buildExamComparativeSnapshot(input: {
  readonly exams: readonly Exam[];
  readonly profile?: LearningProfile;
}): ExamComparativeSnapshot {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const uniqueExams: Exam[] = [];
  const duplicateExamIdsSkipped: string[] = [];

  for (const exam of input.exams) {
    const signature = `${exam.title.trim().toLowerCase()}|${exam.discipline.trim().toLowerCase()}|${exam.examDate.trim()}`;
    if (seenIds.has(exam.id) || seenSignatures.has(signature)) {
      duplicateExamIdsSkipped.push(exam.id);
      continue;
    }
    seenIds.add(exam.id);
    seenSignatures.add(signature);
    uniqueExams.push(exam);
  }

  const totalUniqueExams = uniqueExams.length;
  const hasSufficientSample = totalUniqueExams >= 2;
  const authorizedExamIds = uniqueExams.map((e) => e.id);
  const examsWithValidDate = uniqueExams.filter((e) => parseExamDate(e.examDate) !== null).map((e) => e.id);

  const questionIds = new Set<string>();
  const topicCounts = new Map<string, { label: string; count: number }>();

  for (const exam of uniqueExams) {
    const seenInExam = new Set<string>();
    for (const sub of exam.subjects) {
      const key = sub.name.trim().toLocaleLowerCase("pt-BR");
      if (!key || seenInExam.has(key)) continue;
      seenInExam.add(key);
      const current = topicCounts.get(key);
      if (current) {
        current.count += 1;
      } else {
        topicCounts.set(key, { label: sub.name.trim(), count: 1 });
      }
    }
    for (const attempt of exam.materialAttempts ?? []) {
      for (const q of attempt.questions ?? []) {
        if (q.id) questionIds.add(q.id);
      }
    }
  }

  const topicFrequencies: ObservedTopicFrequency[] = Array.from(topicCounts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
    .map((entry) => ({
      topic: entry.label,
      count: entry.count,
      denominator: totalUniqueExams,
      percentage: totalUniqueExams > 0 ? Math.round((entry.count / totalUniqueExams) * 100) : 0,
    }));

  const lines = [
    `ExamComparative: totalUniqueExams=${totalUniqueExams}, duplicatesSkipped=${duplicateExamIdsSkipped.length}, hasSufficientSample=${hasSufficientSample}.`,
    ...uniqueExams.map(
      (e) =>
        `- examId=${e.id} | title="${e.title}" | date=${parseExamDate(e.examDate) ? e.examDate : "indisponível"} | subjects=[${e.subjects.map((s) => s.name).join(", ")}]`,
    ),
    ...topicFrequencies.map(
      (tf) => `- topic="${tf.topic}" | observed=${tf.count}/${tf.denominator} (${tf.percentage}%)`,
    ),
  ];

  return {
    totalUniqueExams,
    duplicateExamIdsSkipped,
    hasSufficientSample,
    authorizedExamIds,
    authorizedQuestionIds: Array.from(questionIds),
    examsWithValidDate,
    topicFrequencies,
    contextSummary: lines.join("\n"),
  };
}

export function validateExamComparativeOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: ExamComparativeAnalysisOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as ExamComparativeAnalysisOutput;
  } catch {
    return { valid: false, errors: ["A saída de exam.comparative-analysis não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de exam.comparative-analysis deve ser um objeto JSON."] };
  }

  if (parsed.status !== "analyzed" && parsed.status !== "insufficient_sample") {
    errors.push("Campo 'status' deve ser 'analyzed' ou 'insufficient_sample'.");
  }
  if (!Array.isArray(parsed.comparedExams)) {
    errors.push("Campo 'comparedExams' deve ser um array.");
  }
  if (!Array.isArray(parsed.observedTopics)) {
    errors.push("Campo 'observedTopics' deve ser um array.");
  }
  if (!Array.isArray(parsed.recurringPatterns)) {
    errors.push("Campo 'recurringPatterns' deve ser um array.");
  } else {
    parsed.recurringPatterns.forEach((p, idx) => {
      if (!p || typeof p.pattern !== "string" || !p.pattern.trim()) {
        errors.push(`recurringPatterns[${idx}] exige 'pattern'.`);
      }
      if (p?.evidenceType !== "observed_frequency" && p?.evidenceType !== "thematic_similarity") {
        errors.push(`recurringPatterns[${idx}].evidenceType deve ser 'observed_frequency' ou 'thematic_similarity'.`);
      }
      if (!Array.isArray(p?.supportingExamIds) || p.supportingExamIds.length === 0) {
        errors.push(`recurringPatterns[${idx}] exige 'supportingExamIds' não vazio.`);
      }
    });
  }
  if (!Array.isArray(parsed.differencesBetweenExams)) {
    errors.push("Campo 'differencesBetweenExams' deve ser um array.");
  }
  if (typeof parsed.pedagogicalInterpretation !== "string" || parsed.pedagogicalInterpretation.trim().length < 10) {
    errors.push("Campo 'pedagogicalInterpretation' deve ser preenchido.");
  }
  if (!Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
    errors.push("Campo 'recommendations' deve conter ao menos uma recomendação.");
  }
  if (typeof parsed.futureContentUncertaintyNote !== "string" || parsed.futureContentUncertaintyNote.trim().length < 10) {
    errors.push("Campo 'futureContentUncertaintyNote' deve explicitar a incerteza sobre conteúdo futuro.");
  }
  if (!Array.isArray(parsed.sourceRefs) || parsed.sourceRefs.length === 0) {
    errors.push("Campo 'sourceRefs' deve informar referências autorizadas ou 'sem apoio no material'.");
  }

  const prose = [
    parsed.pedagogicalInterpretation ?? "",
    parsed.futureContentUncertaintyNote ?? "",
    ...(Array.isArray(parsed.recommendations) ? parsed.recommendations : []),
  ].join("\n");

  if (FUTURE_GUARANTEE_CLAIM.test(prose)) {
    errors.push("Frequência histórica não pode ser apresentada como garantia de cobrança futura.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validação contextual determinística contra o snapshot de provas, frequências e chunks pós-compressão.
 */
export function validateExamComparativeAgainstSnapshot(
  parsed: ExamComparativeAnalysisOutput,
  snapshot: ExamComparativeSnapshot,
  chunks?: readonly RetrievedChunk[],
): SkillValidationResult {
  const errors: string[] = [];

  if (!snapshot.hasSufficientSample && parsed.status === "analyzed") {
    errors.push(
      `Amostra insuficiente (${snapshot.totalUniqueExams} prova(s) única(s)); esperado status='insufficient_sample'.`,
    );
  }

  const authorizedExams = new Set(snapshot.authorizedExamIds);
  const seenCompared = new Set<string>();
  parsed.comparedExams.forEach((ce, idx) => {
    if (!authorizedExams.has(ce.examId)) {
      errors.push(`comparedExams[${idx}] referencia examId fabricado ou não autorizado: "${ce.examId}".`);
    }
    if (seenCompared.has(ce.examId)) {
      errors.push(`comparedExams[${idx}] contém examId duplicado: "${ce.examId}".`);
    }
    seenCompared.add(ce.examId);
  });

  parsed.recurringPatterns.forEach((rp, idx) => {
    for (const examId of rp.supportingExamIds) {
      if (!authorizedExams.has(examId)) {
        errors.push(`recurringPatterns[${idx}] cita examId não autorizado: "${examId}".`);
      }
    }
  });

  const freqByTopic = new Map(
    snapshot.topicFrequencies.map((tf) => [tf.topic.toLocaleLowerCase("pt-BR"), tf]),
  );

  parsed.observedTopics.forEach((ot, idx) => {
    if (ot.denominator !== snapshot.totalUniqueExams) {
      errors.push(
        `observedTopics[${idx}] ("${ot.topic}") usou denominator=${ot.denominator}, esperado ${snapshot.totalUniqueExams}.`,
      );
    }
    const official = freqByTopic.get(ot.topic.toLocaleLowerCase("pt-BR").trim());
    if (!official) {
      errors.push(`observedTopics[${idx}] cita tópico "${ot.topic}" ausente do snapshot observado.`);
    } else {
      if (ot.count !== official.count || ot.percentage !== official.percentage) {
        errors.push(
          `observedTopics[${idx}] ("${ot.topic}") divergiu da frequência oficial: esperado ${official.count}/${official.denominator} (${official.percentage}%), recebido ${ot.count}/${ot.denominator} (${ot.percentage}%).`,
        );
      }
    }
  });

  const grounding = validateParsedSourceRefs("exam.comparative-analysis", parsed, chunks);
  if (!grounding.valid) {
    errors.push(...grounding.errors);
  }

  return { valid: errors.length === 0, errors };
}

export const examComparativeAnalysisSkillSpec: SkillSpec = {
  id: "exam.comparative-analysis",
  version: "0.1.0",
  objective:
    "Comparar múltiplas avaliações autorizadas e apontar padrões recorrentes com contagens/percentuais verificáveis, diferenciando evidência observada, similaridade temática e incerteza sobre provas futuras.",
  triggers: [
    {
      type: "action",
      value: "compare_exams",
      description: "Análise comparativa de provas no módulo Semana de Prova / Provas.",
    },
    {
      type: "intent",
      value: "find_exam_patterns",
      description: "Estudante pede para comparar provas anteriores e identificar tópicos mais cobrados.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        discipline: { type: "string" },
        comparativeSummary: { type: "string" },
      },
      required: ["discipline"],
    },
    required: ["discipline"],
  },
  output: {
    type: "json",
    requiredKeys: [
      "status",
      "comparedExams",
      "observedTopics",
      "recurringPatterns",
      "differencesBetweenExams",
      "pedagogicalInterpretation",
      "recommendations",
      "futureContentUncertaintyNote",
      "sourceRefs",
    ],
    formatDescription:
      'JSON estrito: { status: "analyzed"|"insufficient_sample", comparedExams: [{ examId, title, examDate?, dateAvailable }], observedTopics: [{ topic, count, denominator, percentage }], recurringPatterns: [{ pattern, evidenceType: "observed_frequency"|"thematic_similarity", supportingExamIds }], differencesBetweenExams: string[], pedagogicalInterpretation, recommendations: string[], futureContentUncertaintyNote, sourceRefs: string[] }.',
    validator: validateExamComparativeOutput,
  },
  allowedContext: ["study", "chunks", "profile", "errors"],
  allowedTools: ["library", "performance"],
  tokenBudget: {
    input: 3500,
    output: 800,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "provas, questões ou estatísticas fabricadas",
      "garantia de cobrança futura baseada apenas em histórico",
      "alteração automática de provas, calendário ou perfil",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Validar IDs de provas, denominadores, contagens e percentuais contra o snapshot real.",
      "Diferenciar frequência observada, similaridade temática, interpretação pedagógica e incerteza futura.",
      "Deduplicar provas repetidas e recusar análise estatística com amostra insuficiente (< 2 provas).",
      "Validar sourceRefs contra os chunks efetivamente mantidos após compressão.",
    ],
    maxOutputWords: 600,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: EXAM_COMPARATIVE_ANALYSIS_FALLBACK_JSON,
    description: "Resposta conservadora em JSON indicando amostra insuficiente para comparação.",
  },
};
