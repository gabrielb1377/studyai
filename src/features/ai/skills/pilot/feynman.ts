/**
 * StudyAI — Intelligence Engine (IE-2)
 * Especificação pedagógica: technique.feynman (v0.1.0).
 * 
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §3.1 e STUDYAI_INTELLIGENCE_ENGINE.md:
 * - Objetivo: consolidar compreensão pedindo ao aluno que explique o conceito
 *   com as próprias palavras, localizando lacunas e simplificando.
 * - Entradas: concept, studentExplanation (máx 2.000 chars), studyId opcional.
 * - Contexto permitido: chunks (<= 3, deduplicados), study.
 * - Ferramentas: library (leitura).
 * - Saída: { understood, gaps: [{point, why, sourceRef?}], simplifiedVersion, followUpQuestion, confidence }.
 * - Segurança: a explicação do aluno é dado delimitado; não classifica o aluno, só a explicação.
 * - Qualidade: gaps citam trecho ou "sem apoio no material"; simplifiedVersion <= 120 palavras.
 * - Fallback: resposta textual com 3 perguntas de reflexão fixas.
 */

import type { SkillSpec, SkillValidationResult } from "../types";

export interface FeynmanGap {
  readonly point: string;
  readonly why: string;
  readonly sourceRef?: string;
}

export interface FeynmanOutput {
  readonly understood: readonly string[];
  readonly gaps: readonly FeynmanGap[];
  readonly simplifiedVersion: string;
  readonly followUpQuestion: string;
  readonly confidence: "low" | "medium" | "high";
}

export const FEYNMAN_FALLBACK_TEXT = [
  "Reflita sobre sua explicação considerando:",
  "1. Como você explicaria este conceito para alguém sem conhecimento prévio no assunto?",
  "2. Quais são os termos técnicos indispensáveis e qual é a definição simples de cada um?",
  "3. Que exemplo prático ou analogia cotidiana melhor representa este funcionamento?",
].join("\n");

export const FEYNMAN_FALLBACK_JSON = JSON.stringify({
  understood: [],
  gaps: [
    {
      point: "Autoavaliação orientada necessária",
      why: "A análise automática não retornou estrutura válida; use as perguntas de reflexão para revisar o conceito.",
      sourceRef: "sem apoio no material",
    },
  ],
  simplifiedVersion: FEYNMAN_FALLBACK_TEXT,
  followUpQuestion: "Como você explicaria este conceito com suas próprias palavras para alguém sem conhecimento prévio?",
  confidence: "low",
} satisfies FeynmanOutput);

export function validateFeynmanOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: FeynmanOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as FeynmanOutput;
  } catch {
    return { valid: false, errors: ["A saída da técnica Feynman não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída da técnica Feynman deve ser um objeto JSON."] };
  }

  if (!Array.isArray(parsed.understood)) {
    errors.push("A propriedade 'understood' deve ser uma lista de pontos compreendidos.");
  }

  if (!Array.isArray(parsed.gaps)) {
    errors.push("A propriedade 'gaps' deve ser uma lista de lacunas conceituais.");
  } else {
    for (let i = 0; i < parsed.gaps.length; i++) {
      const gap = parsed.gaps[i];
      if (!gap.point || !gap.why) {
        errors.push(`A lacuna ${i + 1} deve conter 'point' e 'why'.`);
      }
    }
  }

  if (!parsed.simplifiedVersion || typeof parsed.simplifiedVersion !== "string") {
    errors.push("A propriedade 'simplifiedVersion' deve ser um texto não vazio.");
  } else {
    const wordCount = parsed.simplifiedVersion.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 120) {
      errors.push(`A 'simplifiedVersion' excedeu 120 palavras (${wordCount} palavras).`);
    }
  }

  if (!parsed.followUpQuestion || typeof parsed.followUpQuestion !== "string") {
    errors.push("A propriedade 'followUpQuestion' deve conter uma pergunta de acompanhamento.");
  }

  const validConfidences = ["low", "medium", "high"];
  if (!validConfidences.includes(parsed.confidence)) {
    errors.push("A propriedade 'confidence' deve ser 'low', 'medium' ou 'high'.");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

export const feynmanSkillSpec: SkillSpec = {
  id: "technique.feynman",
  version: "0.1.0",
  objective: "Consolidar compreensão pedindo ao aluno que explique o conceito com palavras simples, e então localizar lacunas e simplificar.",
  triggers: [
    {
      type: "explicit",
      value: "explain_my_words",
      description: "Ação explícita 'Explicar com minhas palavras' na UI de estudo.",
    },
    {
      type: "intent",
      value: "test_understanding",
      description: "Aluno pede para testar se entendeu ou simplificar conceito.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        concept: { type: "string", maxLength: 200 },
        studentExplanation: { type: "string", maxLength: 2000 },
        studyId: { type: "string" },
      },
      required: ["concept", "studentExplanation"],
    },
    required: ["concept", "studentExplanation"],
  },
  allowedContext: ["study", "chunks"],
  allowedTools: ["library"],
  output: {
    type: "json",
    formatDescription: "Objeto JSON contendo understood (array), gaps (array de {point, why, sourceRef?}), simplifiedVersion (texto <= 120 palavras), followUpQuestion e confidence.",
    example: JSON.stringify({
      understood: ["O conceito central de herança foi identificado"],
      gaps: [{ point: "Polimorfismo não foi abordado", why: "Necessário para entender ligação tardia", sourceRef: "página 12" }],
      simplifiedVersion: "Herança é quando uma classe filha herda comportamentos da classe mãe, como na biologia.",
      followUpQuestion: "Como você explicaria o que acontece quando a classe filha altera o método herdado?",
      confidence: "medium",
    }),
    requiredKeys: ["understood", "gaps", "simplifiedVersion", "followUpQuestion", "confidence"],
    validator: validateFeynmanOutput,
  },
  tokenBudget: {
    input: 2500,
    output: 700,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "classificações pejorativas do estudante",
      "diagnósticos pessoais ou de inteligência",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Cada lacuna (gap) cita trecho do material ou declara explicitamente 'sem apoio no material'",
      "Versão simplificada (simplifiedVersion) com no máximo 120 palavras",
      "Exatamente uma pergunta de acompanhamento",
      "Não classifica pejorativamente o estudante",
    ],
    maxOutputWords: 400,
    schemaValidation: true,
  },
  tests: [
    {
      name: "feynman-correct-explanation",
      input: { concept: "Recursão", studentExplanation: "Recursão é quando uma função chama a si mesma até atingir uma condição de parada chamada caso base." },
      expectedValid: true,
    },
    {
      name: "feynman-gap-detected",
      input: { concept: "Recursão", studentExplanation: "Recursão é um loop infinito que nunca para." },
      expectedValid: true,
    },
  ],
  fallback: {
    type: "json",
    content: FEYNMAN_FALLBACK_JSON,
    description: "Estrutura JSON válida contendo as 3 perguntas de reflexão fixas para guiar a autoavaliação do aluno.",
  },
};
