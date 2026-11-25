/**
 * StudyAI — Intelligence Engine (IE-2)
 * Especificação pedagógica: technique.active-recall (v0.1.0).
 * 
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 e §3.2 e STUDYAI_INTELLIGENCE_ENGINE.md:
 * - Objetivo: Praticar evocação ativa com perguntas antes de mostrar a resposta.
 * - Entradas: studyId, topic?, count (3, 5 ou 10), level.
 * - Contexto permitido: study, chunks, errors.
 * - Ferramentas: library, flashcards.
 * - Saída: { questions: [{ id, prompt, expectedAnswer, sourceRef, difficulty }] }.
 * - Segurança: a resposta esperada não vai ao cliente até a tentativa; exige chunk.studyId === studyId.
 * - Qualidade: nenhuma pergunta sem sourceRef; sem duplicar; dificuldade coerente.
 * - Fallback: estrutura JSON segura de pergunta de recuperação reflexiva.
 */

import type { SkillSpec, SkillValidationResult } from "../types";

export interface ActiveRecallQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly expectedAnswer: string;
  readonly sourceRef: string;
  readonly difficulty: "easy" | "medium" | "hard";
}

export interface ActiveRecallOutput {
  readonly questions: readonly ActiveRecallQuestion[];
}

export const ACTIVE_RECALL_FALLBACK_JSON = JSON.stringify({
  questions: [
    {
      id: "recall-fallback-1",
      prompt: "Qual é a definição central do conceito estudado em suas próprias palavras?",
      expectedAnswer: "Definição do conceito central a partir dos trechos principais do material de estudo.",
      sourceRef: "material-base",
      difficulty: "medium",
    },
  ],
});

export function validateActiveRecallOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: ActiveRecallOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as ActiveRecallOutput;
  } catch {
    return { valid: false, errors: ["A saída de Active Recall não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de Active Recall deve ser um objeto JSON."] };
  }

  if (!Array.isArray(parsed.questions)) {
    return { valid: false, errors: ["A propriedade 'questions' deve ser uma lista de questões."] };
  }

  if (parsed.questions.length === 0) {
    errors.push("A lista de questões não pode ser vazia.");
  }

  const validDiffs = ["easy", "medium", "hard"];
  const seenIds = new Set<string>();

  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i];
    if (!q.id || typeof q.id !== "string") {
      errors.push(`Questão ${i + 1} deve conter um 'id' textual único.`);
    } else if (seenIds.has(q.id)) {
      errors.push(`Identificador duplicado encontrado na questão: "${q.id}".`);
    } else {
      seenIds.add(q.id);
    }

    if (!q.prompt || typeof q.prompt !== "string" || q.prompt.trim().length === 0) {
      errors.push(`Questão ${i + 1} deve conter um 'prompt' não vazio.`);
    }

    if (!q.expectedAnswer || typeof q.expectedAnswer !== "string" || q.expectedAnswer.trim().length === 0) {
      errors.push(`Questão ${i + 1} deve conter a resposta esperada ('expectedAnswer').`);
    }

    if (!q.sourceRef || typeof q.sourceRef !== "string" || q.sourceRef.trim().length === 0) {
      errors.push(`Questão ${i + 1} viola a regra de fundamentação: 'sourceRef' é obrigatório.`);
    }

    if (!validDiffs.includes(q.difficulty)) {
      errors.push(`Questão ${i + 1} possui dificuldade inválida "${q.difficulty}". Esperado 'easy', 'medium' ou 'hard'.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

export const activeRecallSkillSpec: SkillSpec = {
  id: "technique.active-recall",
  version: "0.1.0",
  objective: "Praticar evocação ativa com perguntas direcionadas antes de apresentar as respostas esperadas.",
  triggers: [
    {
      type: "action",
      value: "active_recall",
      description: "Ação de evocação ativa selecionada no módulo de estudo.",
    },
    {
      type: "intent",
      value: "recall_practice",
      description: "Aluno inicia sessão de prática e evocação ativa sobre o tema.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        studyId: { type: "string" },
        topic: { type: "string" },
        count: { type: "integer", enum: [3, 5, 10] },
        level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
      },
      required: ["studyId"],
    },
    required: ["studyId"],
  },
  allowedContext: ["study", "chunks", "errors"],
  allowedTools: ["library", "flashcards"],
  output: {
    type: "json",
    formatDescription: "Objeto JSON com lista questions, contendo id, prompt, expectedAnswer, sourceRef e difficulty.",
    example: JSON.stringify({
      questions: [
        {
          id: "q-1",
          prompt: "O que caracteriza uma função pura?",
          expectedAnswer: "Retornar sempre o mesmo resultado para os mesmos argumentos e não produzir efeitos colaterais.",
          sourceRef: "página 14 · Princípios de FP",
          difficulty: "easy",
        },
      ],
    }),
    requiredKeys: ["questions"],
    validator: validateActiveRecallOutput,
  },
  tokenBudget: {
    input: 2000,
    output: 500,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "conteúdo de outros estudos",
      "respostas sem fundamentação no material",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Nenhuma pergunta sem sourceRef rastreável",
      "Sem duplicação de perguntas ou identificadores",
      "Dificuldade coerente com o nível solicitado",
    ],
    maxOutputWords: 500,
    schemaValidation: true,
  },
  tests: [
    {
      name: "active-recall-valid-set",
      input: { studyId: "study-123", topic: "Estruturas de Dados", count: 3, level: "intermediate" },
      expectedValid: true,
    },
  ],
  fallback: {
    type: "json",
    content: ACTIVE_RECALL_FALLBACK_JSON,
    description: "Pergunta de recuperação reflexiva estruturada para contingência.",
  },
};
