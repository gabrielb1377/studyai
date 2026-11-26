/**
 * StudyAI — Intelligence Engine (IE-4A)
 * Especificação pedagógica: examples.analogies (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#19):
 * - Objetivo: Gerar exemplos e analogias adequados ao nível.
 * - Base existente: métodos `analogies` e `practical_examples` do Teacher (`METHOD_INSTRUCTIONS`).
 * - Ferramentas (fase): `library` (declarativo até Tool Engine).
 * - Orçamento inicial: 1.500 entrada / 500 saída.
 */

import { METHOD_INSTRUCTIONS } from "../teacher/TeacherSkills";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface ExampleAnalogyItem {
  readonly kind: "analogy" | "practical_example";
  readonly title: string;
  readonly explanation: string;
  readonly conceptLink: string;
  /** Obrigatório para kind === "analogy": explicita onde a analogia deixa de representar o conceito. */
  readonly analogyLimit?: string;
  readonly sourceRef?: string;
}

export interface ExamplesAnalogiesOutput {
  readonly concept: string;
  readonly level: "beginner" | "intermediate" | "advanced";
  readonly items: readonly ExampleAnalogyItem[];
}

export const EXAMPLES_ANALOGIES_FALLBACK_JSON = JSON.stringify({
  concept: "Conceito em estudo",
  level: "beginner",
  items: [
    {
      kind: "practical_example",
      title: "Exemplo guiado pelo material",
      explanation: "Aplique o conceito diretamente a um caso simples descrito nos trechos do seu material de estudo.",
      conceptLink: "Relaciona a definição teórica ao uso concreto presente no material.",
      sourceRef: "sem apoio no material",
    },
  ],
} satisfies ExamplesAnalogiesOutput);

export function validateExamplesAnalogiesOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: ExamplesAnalogiesOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as ExamplesAnalogiesOutput;
  } catch {
    return { valid: false, errors: ["A saída de examples.analogies não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de examples.analogies deve ser um objeto JSON."] };
  }

  if (!parsed.concept || typeof parsed.concept !== "string" || !parsed.concept.trim()) {
    errors.push("A propriedade 'concept' deve conter o conceito explicado.");
  }

  const validLevels = ["beginner", "intermediate", "advanced"];
  if (!validLevels.includes(parsed.level)) {
    errors.push("A propriedade 'level' deve ser 'beginner', 'intermediate' ou 'advanced'.");
  }

  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    errors.push("A propriedade 'items' deve conter ao menos um exemplo prático ou analogia.");
  } else {
    parsed.items.forEach((item, idx) => {
      if (item?.kind !== "analogy" && item?.kind !== "practical_example") {
        errors.push(`Item ${idx + 1} deve ter kind 'analogy' ou 'practical_example'.`);
      }
      if (!item?.title || !item?.explanation || !item?.conceptLink) {
        errors.push(`Item ${idx + 1} deve conter 'title', 'explanation' e 'conceptLink' não vazios.`);
      }
      if (item?.kind === "analogy" && (!item.analogyLimit || !item.analogyLimit.trim())) {
        errors.push(`Analogia ${idx + 1} exige 'analogyLimit' explicando claramente onde a analogia deixa de representar o conceito.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

export const examplesAnalogiesSkillSpec: SkillSpec = {
  id: "examples.analogies",
  version: "0.1.0",
  objective: "Gerar exemplos práticos e analogias cotidianas adequados ao nível do estudante, explicitando os limites de cada analogia.",
  triggers: [
    {
      type: "action",
      value: "analogies",
      description: "Método 'Analogias' ou 'Exemplos práticos' selecionado no Professor.",
    },
    {
      type: "intent",
      value: "request_example_or_analogy",
      description: "Estudante pede um exemplo concreto ou analogia para compreender um conceito.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        concept: { type: "string", maxLength: 200 },
        level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
        style: { type: "string", enum: ["analogy", "practical_example", "both"] },
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
      "Objeto JSON com concept, level ('beginner'|'intermediate'|'advanced') e items ([{kind, title, explanation, conceptLink, analogyLimit?, sourceRef?}]).",
    example: JSON.stringify({
      concept: "Fila (Queue)",
      level: "beginner",
      items: [
        {
          kind: "analogy",
          title: "Fila de padaria (FIFO)",
          explanation: "A primeira pessoa que entra na fila é a primeira a ser atendida.",
          conceptLink: "Representa a política First-In, First-Out de inserção no fim e remoção no início.",
          analogyLimit: "Diferente de pessoas em uma padaria, uma fila em memória pode ter capacidade fixa e não permite 'furar fila' sem outra estrutura.",
          sourceRef: "Estruturas de Dados · p. 22",
        },
      ],
    }),
    requiredKeys: ["concept", "level", "items"],
    validator: validateExamplesAnalogiesOutput,
  },
  tokenBudget: {
    input: 1500,
    output: 500,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "afirmações de ter lido arquivos físicos do sistema operacional",
      "analogias sem indicação de limite conceitual",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Preserva as diretrizes canônicas dos métodos analogies e practical_examples do TeacherPromptBuilder",
      "Toda analogia declara explicitamente analogyLimit para evitar conclusões falsas",
      "Relaciona claramente o exemplo ao conceito estudado",
    ],
    maxOutputWords: 320,
    schemaValidation: true,
  },
  buildInstruction: (params: unknown) => {
    const style = (params as { style?: "analogy" | "practical_example" | "both" } | undefined)?.style;
    if (style === "analogy") return METHOD_INSTRUCTIONS.analogies;
    if (style === "practical_example") return METHOD_INSTRUCTIONS.practical_examples;
    return `${METHOD_INSTRUCTIONS.analogies} ${METHOD_INSTRUCTIONS.practical_examples}`;
  },
  fallback: {
    type: "json",
    content: EXAMPLES_ANALOGIES_FALLBACK_JSON,
    description: "Estrutura JSON válida com exemplo prático guiado para contingência.",
  },
};
