/**
 * StudyAI — Intelligence Engine (IE-2)
 * Especificação pedagógica: technique.socratic (v0.1.0).
 * 
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 e §4 e STUDYAI_INTELLIGENCE_ENGINE.md:
 * - Objetivo: Conduzir por perguntas orientadas ao raciocínio, sem entregar
 *   a resposta de início, identificando a compreensão atual do aluno.
 * - Entradas: topic, studentResponse?, currentQuestion?, step (1..5).
 * - Contexto permitido: study, chunks, history.
 * - Ferramentas: library.
 * - Saída: { understandingAssessment, guidingQuestion, hint?, nextStep, revealsSolution }.
 * - Segurança: não entrega soluções completas prematuras; dado do aluno delimitado.
 * - Qualidade: revealsSolution deve ser false se step < 5; 1 pergunta aberta por vez.
 * - Fallback: pergunta socrática de reflexão aberta inicial.
 */

import type { SkillSpec, SkillValidationResult } from "../types";

export interface SocraticOutput {
  readonly understandingAssessment: string;
  readonly guidingQuestion: string;
  readonly hint?: string;
  readonly nextStep: number;
  readonly revealsSolution: boolean;
}

export const SOCRATIC_FALLBACK_TEXT =
  "Vamos analisar este ponto juntos: o que você já sabe sobre os conceitos fundamentais envolvidos e qual seria o primeiro princípio aplicável a este caso?";

export function validateSocraticOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: SocraticOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as SocraticOutput;
  } catch {
    return { valid: false, errors: ["A saída do método socrático não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída do método socrático deve ser um objeto JSON."] };
  }

  if (!parsed.understandingAssessment || typeof parsed.understandingAssessment !== "string") {
    errors.push("A propriedade 'understandingAssessment' deve conter a avaliação do raciocínio.");
  }

  if (!parsed.guidingQuestion || typeof parsed.guidingQuestion !== "string") {
    errors.push("A propriedade 'guidingQuestion' deve conter uma pergunta socrática.");
  }

  if (typeof parsed.nextStep !== "number" || parsed.nextStep < 1 || parsed.nextStep > 5) {
    errors.push("A propriedade 'nextStep' deve ser um número inteiro de 1 a 5.");
  }

  if (typeof parsed.revealsSolution !== "boolean") {
    errors.push("A propriedade 'revealsSolution' deve ser um booleano.");
  } else if (parsed.nextStep < 5 && parsed.revealsSolution === true) {
    errors.push("A técnica socrática proíbe revelar a solução prematuramente antes do passo final (etapa < 5).");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

export const socraticSkillSpec: SkillSpec = {
  id: "technique.socratic",
  version: "0.1.0",
  objective: "Conduzir o aluno por perguntas que estimulem o raciocínio investigativo, sem entregar a resposta de início.",
  triggers: [
    {
      type: "action",
      value: "socratic",
      description: "Método de ensino socrático selecionado no Tutor ou Professor.",
    },
    {
      type: "intent",
      value: "guided_reasoning",
      description: "Aluno solicita ser desafiado a pensar em vez de receber resposta pronta.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        studentResponse: { type: "string" },
        currentQuestion: { type: "string" },
        step: { type: "integer", minimum: 1, maximum: 5 },
      },
      required: ["topic"],
    },
    required: ["topic"],
  },
  allowedContext: ["study", "chunks", "history"],
  allowedTools: ["library"],
  output: {
    type: "json",
    formatDescription: "Objeto JSON contendo understandingAssessment, guidingQuestion, hint (opcional), nextStep (1..5) e revealsSolution (booleano).",
    example: JSON.stringify({
      understandingAssessment: "O estudante percebeu que a busca sequencial é lenta, mas ainda não relacionou ordenação com busca binária.",
      guidingQuestion: "Se a lista de números já estiver perfeitamente em ordem crescente, você precisa olhar item por item desde o primeiro?",
      hint: "Pense em como você procura uma palavra num dicionário impresso.",
      nextStep: 2,
      revealsSolution: false,
    }),
    requiredKeys: ["understandingAssessment", "guidingQuestion", "nextStep", "revealsSolution"],
    validator: validateSocraticOutput,
  },
  tokenBudget: {
    input: 2500,
    output: 500,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "respostas diretas antecipadas",
      "soluções completas prematuras",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Não entregar a resposta final prematuramente (revealsSolution: false se step < 5)",
      "Uma pergunta socrática aberta por vez",
      "Análise construtiva sem julgamento pejorativo",
    ],
    maxOutputWords: 300,
    schemaValidation: true,
  },
  tests: [
    {
      name: "socratic-step1-prompt",
      input: { topic: "Busca Binária", step: 1 },
      expectedValid: true,
    },
    {
      name: "socratic-step2-guided",
      input: {
        topic: "Busca Binária",
        studentResponse: "No dicionário eu abro no meio primeiro.",
        currentQuestion: "Como você procura uma palavra num dicionário?",
        step: 2,
      },
      expectedValid: true,
    },
  ],
  fallback: {
    type: "text",
    content: SOCRATIC_FALLBACK_TEXT,
    description: "Pergunta socrática de reflexão aberta para continuar o diálogo sem travar.",
  },
};
