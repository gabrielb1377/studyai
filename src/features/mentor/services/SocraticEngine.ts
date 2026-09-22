import type { KnowledgeConcept, KnowledgeGraph } from "@/features/semantic/types";
import type { StudyRecord } from "@/types/study-engine";
import type { MentorEvaluation, MentorLevel, MentorQuestion } from "../types";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

function words(value: string) {
  return new Set(normalize(value).split(/\s+/).filter((word) => word.length > 2));
}

function selectConcept(graphs: readonly KnowledgeGraph[], index: number): KnowledgeConcept | undefined {
  const concepts = graphs.flatMap((graph) => graph.concepts).sort((left, right) => right.importance - left.importance);
  return concepts[index % Math.max(1, concepts.length)];
}

export const SocraticEngine = {
  createQuestion(study: StudyRecord, graphs: readonly KnowledgeGraph[], level: MentorLevel, index = 0): MentorQuestion {
    const concept = selectConcept(graphs, index);
    const conceptName = concept?.name ?? study.subtopics?.[index % Math.max(1, study.subtopics.length)] ?? study.title;
    const explanation = concept?.description || study.initialSummary || `Conceito central de ${study.title}.`;
    const expectedKeywords = Array.from(new Set([
      ...(concept?.keywords ?? []),
      ...words(explanation),
      ...words(conceptName),
    ])).slice(0, level === "Avançado" ? 8 : 6);
    const prompt = level === "Iniciante"
      ? `Com suas palavras, o que significa ${conceptName}?`
      : level === "Intermediário"
        ? `Como ${conceptName} se relaciona com ${study.title}? Dê um exemplo.`
        : `Em qual situação ${conceptName} deixaria de funcionar como esperado e por quê?`;
    return {
      id: `mentor-question-${Date.now()}-${index}`,
      prompt,
      concept: conceptName,
      explanation,
      expectedKeywords,
      difficulty: level,
      source: concept ? { fileId: concept.fileId, document: concept.document, page: concept.page, chapter: concept.chapter } : undefined,
    };
  },

  evaluate(question: MentorQuestion, answer: string, now = new Date().toISOString()): MentorEvaluation {
    const answerWords = words(answer);
    const expected = question.expectedKeywords.filter(Boolean);
    const hits = expected.filter((keyword) => Array.from(words(keyword)).some((word) => answerWords.has(word))).length;
    const coverage = expected.length ? hits / expected.length : answer.trim().length >= 40 ? 0.6 : 0;
    const score = Math.min(100, Math.round(coverage * 100 + Math.min(20, answer.trim().length / 10)));
    const result = score >= 70 ? "correct" : score >= 40 ? "partial" : "incorrect";
    return {
      score,
      result,
      why: result === "correct"
        ? `Sua resposta apresentou os elementos essenciais de ${question.concept}.`
        : result === "partial"
          ? `Você reconheceu parte do conceito, mas a relação principal ainda ficou incompleta.`
          : `A resposta ainda não demonstrou os elementos centrais registrados no material.`,
      improvement: result === "correct"
        ? "Tente conectar o conceito a outro tópico para consolidar a compreensão."
        : `Revise a definição e procure explicar causa, efeito e um exemplo de ${question.concept}.`,
      reviewTarget: question.source?.chapter ?? question.source?.document ?? question.concept,
      followUpQuestion: result === "correct" ? undefined : `Qual parte de ${question.concept} aparece primeiro no material e o que ela tenta explicar?`,
      evaluatedAt: now,
    };
  },
};

