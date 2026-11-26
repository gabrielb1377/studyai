/**
 * StudyAI — Intelligence Engine (IE-4A)
 * Especificação pedagógica: tutor.beginner (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#1):
 * - Objetivo: Explicar do zero, passo curto, checagem de compreensão.
 * - Base existente: nível `beginner` e métodos do Teacher (`LEVEL_INSTRUCTIONS.beginner`).
 * - Ferramentas (fase): `library` (declarativo até Tool Engine).
 * - Orçamento inicial: 2.500 entrada / 600 saída.
 */

import { LEVEL_INSTRUCTIONS } from "../teacher/TeacherSkills";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface DefinedTerm {
  readonly term: string;
  readonly definition: string;
}

export interface TutorBeginnerOutput {
  readonly definedTerms: readonly DefinedTerm[];
  readonly shortSteps: readonly string[];
  readonly concreteExample: string;
  readonly comprehensionCheck: string;
  readonly sourceRefs: readonly string[];
}

export const TUTOR_BEGINNER_FALLBACK_JSON = JSON.stringify({
  definedTerms: [
    {
      term: "Conceito base",
      definition: "Ideia central do tema estudado apresentada de forma simples a partir do material.",
    },
  ],
  shortSteps: [
    "Releia a definição principal do conceito no material de estudo.",
    "Identifique quais termos novos aparecem e anote o significado de cada um.",
  ],
  concreteExample: "Pense em uma situação simples do cotidiano onde essa regra aparece passo a passo.",
  comprehensionCheck: "Qual parte deste conceito parece mais clara para você agora e qual termo ainda gera dúvida?",
  sourceRefs: ["sem apoio no material"],
} satisfies TutorBeginnerOutput);

export function validateTutorBeginnerOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: TutorBeginnerOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as TutorBeginnerOutput;
  } catch {
    return { valid: false, errors: ["A saída de tutor.beginner não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de tutor.beginner deve ser um objeto JSON."] };
  }

  if (!Array.isArray(parsed.definedTerms) || parsed.definedTerms.length === 0) {
    errors.push("A propriedade 'definedTerms' deve definir ao menos um termo antes de utilizá-lo.");
  } else {
    parsed.definedTerms.forEach((item, idx) => {
      if (!item?.term || !item?.definition) {
        errors.push(`Termo ${idx + 1} deve conter 'term' e 'definition' não vazios.`);
      }
    });
  }

  if (!Array.isArray(parsed.shortSteps) || parsed.shortSteps.length === 0) {
    errors.push("A propriedade 'shortSteps' deve conter ao menos um passo curto.");
  } else if (parsed.shortSteps.length > 5) {
    errors.push(`A propriedade 'shortSteps' deve manter no máximo 5 passos curtos (recebido ${parsed.shortSteps.length}).`);
  }

  if (!parsed.concreteExample || typeof parsed.concreteExample !== "string" || !parsed.concreteExample.trim()) {
    errors.push("A propriedade 'concreteExample' deve conter um exemplo concreto não vazio.");
  }

  if (!parsed.comprehensionCheck || typeof parsed.comprehensionCheck !== "string" || !parsed.comprehensionCheck.trim()) {
    errors.push("A propriedade 'comprehensionCheck' deve conter uma pergunta de checagem de compreensão.");
  }

  if (!Array.isArray(parsed.sourceRefs)) {
    errors.push("A propriedade 'sourceRefs' deve ser uma lista de referências (ou ['sem apoio no material']).");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

export const tutorBeginnerSkillSpec: SkillSpec = {
  id: "tutor.beginner",
  version: "0.1.0",
  objective: "Explicar do zero, em passos curtos, definindo termos antes de utilizá-los, com exemplo concreto e checagem de compreensão.",
  triggers: [
    {
      type: "action",
      value: "beginner_explanation",
      description: "Nível iniciante selecionado no Tutor ou Professor.",
    },
    {
      type: "intent",
      value: "explain_from_scratch",
      description: "Estudante pede explicação introdutória do zero sem presumir conhecimento prévio.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        concept: { type: "string", maxLength: 200 },
        question: { type: "string", maxLength: 1000 },
        studyId: { type: "string" },
      },
      required: ["concept"],
    },
    required: ["concept"],
  },
  allowedContext: ["study", "chunks"],
  allowedTools: ["library"],
  output: {
    type: "json",
    formatDescription:
      "Objeto JSON com definedTerms ([{term, definition}]), shortSteps (1..5 passos curtos), concreteExample, comprehensionCheck e sourceRefs.",
    example: JSON.stringify({
      definedTerms: [{ term: "Variável", definition: "Um espaço nomeado na memória que guarda um valor." }],
      shortSteps: ["Escolha um nome claro.", "Guarde o valor inicial.", "Use o nome quando precisar ler esse valor."],
      concreteExample: "Uma caixa etiquetada 'idade' guardando o número 20.",
      comprehensionCheck: "Se trocarmos o valor dentro da caixa 'idade' para 21, o nome da caixa muda?",
      sourceRefs: ["Introdução à Programação · p. 5"],
    }),
    requiredKeys: ["definedTerms", "shortSteps", "concreteExample", "comprehensionCheck", "sourceRefs"],
    validator: validateTutorBeginnerOutput,
  },
  tokenBudget: {
    input: 2500,
    output: 600,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "classificações pejorativas do estudante",
      "afirmações de ter lido arquivos físicos do sistema operacional",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Preserva a diretriz canônica do nível beginner do TeacherPromptBuilder",
      "Define termos técnicos antes de utilizá-los",
      "Apresenta no máximo 5 passos curtos e um exemplo concreto",
      "Inclui checagem de compreensão ao final",
    ],
    maxOutputWords: 350,
    schemaValidation: true,
  },
  buildInstruction: () => LEVEL_INSTRUCTIONS.beginner,
  fallback: {
    type: "json",
    content: TUTOR_BEGINNER_FALLBACK_JSON,
    description: "Estrutura JSON válida de apoio introdutório para contingência.",
  },
};
