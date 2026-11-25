/**
 * Avaliadores determinísticos gratuitos — sem custo, sem LLM.
 * Cada critério retorna { passed, score: 0-1, reasoning }.
 */

import type { EvaluationCase, QualityCriterion, EvaluationResult, EvaluationMode } from "./types";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function containsAny(haystack: string, needles: string[]): boolean {
  const norm = normalize(haystack);
  return needles.some((n) => norm.includes(normalize(n)));
}

function countOccurrences(text: string, pattern: string): number {
  const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (text.match(regex) ?? []).length;
}

export const DeterministicEvaluator = {
  /**
   * Fidelidade: a resposta não introduz conceitos ausentes do material.
   * Heurística: overlap de substantivos/termos técnicos entre resposta e material >= 0.3
   * E resposta não contém termos fortes não presentes no material.
   */
  fidelity({ sourceMaterial, expectedAnswer, actualAnswer }: Pick<EvaluationCase, "sourceMaterial" | "expectedAnswer"> & { actualAnswer: string }) {
    const sourceWords = words(sourceMaterial);
    const answerWords = words(actualAnswer);
    const expectedWords = words(expectedAnswer);

    // Termos-chave do material (substantivos longos, siglas, números)
    const keyTerms = sourceWords.filter((w) => w.length >= 5 || /^[A-Z]{2,}$/.test(w.toUpperCase()));
    const keyTermsInAnswer = keyTerms.filter((t) => answerWords.includes(t));
    const keyTermsInExpected = keyTerms.filter((t) => expectedWords.includes(t));

    const recall = keyTermsInExpected.length > 0 ? keyTermsInAnswer.length / keyTermsInExpected.length : 1;
    const precision = keyTermsInAnswer.length > 0 ? keyTermsInAnswer.length / answerWords.length : 0;

    // Penaliza termos "fortes" inventados (ex: nomes próprios, datas, números não no material)
    const strongPatterns = /\b\d{4}\b|\b[A-Z][a-z]+ [A-Z][a-z]+\b|\b[A-Z]{3,}\b/g;
    const invented = (actualAnswer.match(strongPatterns) ?? []).filter(
      (m) => !sourceMaterial.includes(m)
    ).length;

    const score = Math.max(0, Math.min(1, (recall + precision) / 2 - invented * 0.15));
    const passed = score >= 0.6 && invented === 0;

    return {
      passed,
      score: Number(score.toFixed(2)),
      reasoning: `Recall termos-chave: ${(recall * 100).toFixed(0)}%; Precisão: ${(precision * 100).toFixed(0)}%; Termos inventados: ${invented}`,
    };
  },

  /**
   * Relevância: resposta aborda a pergunta.
   * Heurística: overlap semântico entre pergunta e resposta >= 0.2
   * E resposta não é genérica ("não sei", "consulte o material").
   */
  relevance({ question, actualAnswer }: Pick<EvaluationCase, "question"> & { actualAnswer: string }) {
    const qWords = words(question);
    const aWords = words(actualAnswer);
    const overlap = jaccard(qWords, aWords);

    const generic = /^(não sei|consulte|veja o material|não tenho|não consta|não há informação)/i.test(actualAnswer.trim());
    const tooShort = aWords.length < 8;

    const score = generic || tooShort ? 0 : Math.min(1, overlap * 2.5);
    const passed = score >= 0.4;

    return {
      passed,
      score: Number(score.toFixed(2)),
      reasoning: `Overlap pergunta-resposta: ${(overlap * 100).toFixed(0)}%; Genérica: ${generic}; Curta: ${tooShort}`,
    };
  },

  /**
   * Citações: resposta contém referências de página (p. X) ou trechos do material.
   * Heurística: busca padrão (p. \d+) ou trechos >= 30 chars do material.
   */
  citations({ sourceMaterial, actualAnswer, expectedCitations, expectedPageRefs }: EvaluationCase & { actualAnswer: string }) {
    const pageRefs = (actualAnswer.match(/\(?p\.?\s*\d+[–-]?\d*\)?/gi) ?? []).length;
    const explicitCitations = expectedCitations?.some((c) => actualAnswer.includes(c)) ?? false;

    // Verifica se trechos longos do material aparecem na resposta
    const sourceSentences = sourceMaterial
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 30);
    const quotedSentences = sourceSentences.filter((s) => actualAnswer.includes(s)).length;

    const hasPageRef = expectedPageRefs?.some((p) => actualAnswer.includes(`p. ${p}`) || actualAnswer.includes(`página ${p}`)) ?? false;
    const score = (pageRefs > 0 ? 0.4 : 0) + (explicitCitations ? 0.3 : 0) + (quotedSentences > 0 ? 0.3 : 0) + (hasPageRef ? 0.3 : 0);
    const passed = Math.min(1, score) >= 0.5;

    return {
      passed,
      score: Number(Math.min(1, score).toFixed(2)),
      reasoning: `Refs de página: ${pageRefs}; Trechos citados: ${quotedSentences}; Página esperada: ${hasPageRef}`,
    };
  },

  /**
   * Sem contexto: quando material não tem a resposta, o sistema admite.
   * Heurística: se expectedAnswer indica "não há info", verifica se resposta admite limitação.
   */
  noContext({ expectedAnswer, actualAnswer, sourceMaterial }: Pick<EvaluationCase, "expectedAnswer" | "sourceMaterial"> & { actualAnswer: string }) {
    const expectsNoInfo = /não (há|existe|consta|encontrei|informação|dado)/i.test(expectedAnswer);
    if (!expectsNoInfo) return { passed: true, score: 1, reasoning: "Critério não aplicável (material tem a resposta)." };

    const admitsLimitation = /(não (sei|encontrei|há|consta|informação|dado)|limitação|não está no material|fora do escopo)/i.test(actualAnswer);
    const invents = !admitsLimitation && actualAnswer.length > 30;

    const score = admitsLimitation ? 1 : invents ? 0 : 0.3;
    const passed = admitsLimitation;

    return {
      passed,
      score,
      reasoning: `Espera "sem info": ${expectsNoInfo}; Admite limitação: ${admitsLimitation}; Inventa: ${invents}`,
    };
  },

  /**
   * Qualidade pedagógica: estrutura, didática, nível adequado.
   * Heurística: tem estrutura (parágrafos, lista, passos), não é apenas lista de fatos.
   */
  pedagogical({ actualAnswer }: { actualAnswer: string }) {
    const hasStructure = /\n\n|\n[-*•]\s|\n\d+\.\s|(primeiro|segundo|em seguida|por fim|conclusão)/i.test(actualAnswer);
    const hasExplanation = /(porque|pois|já que|logo|portanto|assim|exemplo|ilustra)/i.test(actualAnswer);
    const notJustFacts = actualAnswer.split(/[.!?]/).filter(Boolean).length >= 3;

    const score = (hasStructure ? 0.4 : 0) + (hasExplanation ? 0.3 : 0) + (notJustFacts ? 0.3 : 0);
    const passed = score >= 0.6;

    return {
      passed,
      score: Number(score.toFixed(2)),
      reasoning: `Estrutura: ${hasStructure}; Explicação: ${hasExplanation}; Múltiplos pontos: ${notJustFacts}`,
    };
  },

  /**
   * Correção de exercício: inclui justificativa, conceito, revisão.
   */
  exerciseCorrection({ actualAnswer }: { actualAnswer: string }) {
    const hasJustification = /(justificativa|porque|razão|motivo|baseado em|conforme)/i.test(actualAnswer);
    const hasConcept = /(conceito|definição|princípio|teorema|lei|regra)/i.test(actualAnswer);
    const hasReview = /(revisão|resumo|conclusão|portanto|logo)/i.test(actualAnswer);

    const score = (hasJustification ? 0.4 : 0) + (hasConcept ? 0.35 : 0) + (hasReview ? 0.25 : 0);
    const passed = score >= 0.6;

    return {
      passed,
      score: Number(score.toFixed(2)),
      reasoning: `Justificativa: ${hasJustification}; Conceito: ${hasConcept}; Revisão: ${hasReview}`,
    };
  },

  /**
   * Consistência de idioma: resposta no mesmo idioma da pergunta/material.
   * Heurística simples: contagem de stopwords pt-BR vs en-US.
   */
  languageConsistency({ question, sourceMaterial, actualAnswer }: Pick<EvaluationCase, "question" | "sourceMaterial"> & { actualAnswer: string }) {
    const ptStopwords = ["de", "da", "do", "em", "para", "com", "que", "não", "uma", "os", "as", "o", "a", "e", "é"];
    const enStopwords = ["the", "and", "for", "with", "that", "not", "are", "was", "have", "this", "from"];

    const countPt = (t: string) => ptStopwords.reduce((c, w) => c + countOccurrences(t, `\\b${w}\\b`), 0);
    const countEn = (t: string) => enStopwords.reduce((c, w) => c + countOccurrences(t, `\\b${w}\\b`), 0);

    const totalPt = countPt(question) + countPt(sourceMaterial) + countPt(actualAnswer);
    const totalEn = countEn(question) + countEn(sourceMaterial) + countEn(actualAnswer);
    const dominant = totalPt >= totalEn ? "pt" : "en";
    const answerDominant = countPt(actualAnswer) >= countEn(actualAnswer) ? "pt" : "en";

    const passed = dominant === answerDominant;
    const score = passed ? 1 : 0.2;

    return {
      passed,
      score,
      reasoning: `Dominante contexto: ${dominant}; Resposta: ${answerDominant} (pt: ${countPt(actualAnswer)}, en: ${countEn(actualAnswer)})`,
    };
  },

  /**
   * Tratamento de erro de provider: não expõe stack, mensagem amigável.
   */
  providerErrorHandling({ actualAnswer }: { actualAnswer: string }) {
    const exposesInternals = /(stack trace|internal error|undefined|property of null|Cannot read|at Object\.)/i.test(actualAnswer);
    const friendly = /(tente novamente|indisponível|erro temporário|configure|verifique)/i.test(actualAnswer);

    const passed = !exposesInternals && friendly;
    const score = exposesInternals ? 0 : friendly ? 1 : 0.5;

    return {
      passed,
      score,
      reasoning: `Expõe internos: ${exposesInternals}; Amigável: ${friendly}`,
    };
  },

  evaluateAll(case_: EvaluationCase, actualAnswer: string): EvaluationResult[] {
    return case_.criteria.map((criterion) => {
      const evaluator = this[criterion as keyof typeof this];
      if (typeof evaluator === "function") {
        const result = (evaluator as (c: typeof case_ & { actualAnswer: string }) => { passed: boolean; score: number; reasoning: string })({
          ...case_,
          actualAnswer,
        });
        return {
          caseId: case_.id,
          criterion,
          passed: result.passed,
          score: result.score,
          reasoning: result.reasoning,
          mode: "deterministic" as EvaluationMode,
          timestamp: new Date().toISOString(),
        };
      }
      return {
        caseId: case_.id,
        criterion,
        passed: false,
        score: 0,
        reasoning: "Avaliador não implementado.",
        mode: "deterministic" as EvaluationMode,
        timestamp: new Date().toISOString(),
      };
    });
  },
};