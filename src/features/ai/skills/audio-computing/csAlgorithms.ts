/**
 * StudyAI — Intelligence Engine (IE-4E)
 * Especificação pedagógica: cs.algorithms (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#20):
 * - Objetivo: Ensinar algoritmos e estruturas de dados com traço de execução.
 * - Base existente: `lab/*` (JS), contratos de diagramas Mermaid (`diagrams/*`).
 * - Ferramentas (fase): `js_exec`, `diagram` (estritamente declarativas até Onda 3).
 * - Orçamento inicial: 3.000 entrada / 900 saída.
 *
 * Regras de segurança e integridade:
 * - Valida traços de um subconjunto pequeno de algoritmos canônicos determinísticos
 *   (`binary_search`, `linear_search`, `insertion_sort`) sem criar interpretador universal.
 * - Nunca alega validação semântica universal para algoritmos arbitrários.
 * - Não renderiza nem executa diagramas retornados pela IA (`declarativeOnly: true`).
 * - Bloqueia HTML ativo, `<script`, `javascript:`, `click ... javascript:` e imagens remotas Markdown (PS-1a/PS-1b).
 */

import type { SkillSpec, SkillValidationResult } from "../types";

export type CanonicalAlgorithmId = "binary_search" | "linear_search" | "insertion_sort";

export interface AlgorithmTraceSnapshot {
  readonly algorithmName: string;
  readonly canonicalAlgorithm?: CanonicalAlgorithmId;
  readonly dataStructure?: string;
  readonly sampleInput: readonly number[];
  readonly target?: number;
  readonly hasDeterministicReference: boolean;
  readonly expectedResult?: string;
  readonly expectedStepCountHint?: number;
  readonly expectedComplexityWorst?: string;
  readonly contextSummary: string;
}

export interface AlgorithmTraceStep {
  readonly step: number;
  readonly action: string;
  readonly intermediateState: string;
}

export interface AlgorithmComplexity {
  readonly timeBest?: string;
  readonly timeAverage?: string;
  readonly timeWorst: string;
  readonly space: string;
}

export interface AlgorithmComplementaryDiagram {
  readonly modality: "mermaid" | "text_fallback";
  readonly status: "specification_only" | "textual_fallback";
  readonly content: string;
}

export interface CsAlgorithmsOutput {
  readonly algorithmName: string;
  readonly dataStructure?: string;
  readonly explanation: string;
  readonly inputSummary: string;
  readonly traceSteps: readonly AlgorithmTraceStep[];
  readonly expectedOutput: string;
  readonly complexity: AlgorithmComplexity;
  readonly complementaryDiagram?: AlgorithmComplementaryDiagram;
  /** Sempre true na Onda 2: traço e diagrama são especificações declarativas, não executados/renderizados. */
  readonly declarativeOnly: boolean;
  /** Explicita o alcance real da verificação (sem alegar verificação semântica universal). */
  readonly deterministicVerificationScope: "canonical_subset" | "structural_only";
}

export const CS_ALGORITHMS_FALLBACK_JSON = JSON.stringify({
  algorithmName: "Algoritmo em estudo",
  dataStructure: "Vetor (Array)",
  explanation:
    "Para acompanhar um algoritmo com clareza, escolha uma entrada pequena (3 a 5 elementos), anote o estado das variáveis a cada iteração e verifique a condição de parada.",
  inputSummary: "Entrada de exemplo pequena: [3, 1, 2]",
  traceSteps: [
    {
      step: 1,
      action: "Inicializar índices e inspecionar a entrada.",
      intermediateState: "entrada=[3, 1, 2]",
    },
    {
      step: 2,
      action: "Aplicar a regra principal passo a passo até a condição de parada.",
      intermediateState: "estado final verificado manualmente",
    },
  ],
  expectedOutput: "Resultado conforme a especificação do algoritmo para a entrada pequena fornecida.",
  complexity: {
    timeWorst: "Depende do algoritmo analisado",
    space: "Depende da estrutura auxiliar utilizada",
  },
  complementaryDiagram: {
    modality: "text_fallback",
    status: "textual_fallback",
    content: "Entrada -> Passo 1 (estado intermediário) -> Passo N -> Saída esperada.",
  },
  declarativeOnly: true,
  deterministicVerificationScope: "structural_only",
} satisfies CsAlgorithmsOutput);

const DANGEROUS_CONTENT_PATTERN =
  /(<\s*script\b|<\s*iframe\b|<\s*object\b|<\s*embed\b|javascript\s*:|data\s*:\s*text\/html|on(?:error|load|click|mouseover)\s*=|!\[[^\]]*\]\(\s*https?:\/\/|\beval\s*\()/i;

const MERMAID_HEADER_PATTERN =
  /^\s*(flowchart|graph|sequenceDiagram|mindmap|stateDiagram(?:-v2)?|classDiagram|erDiagram)\b/;

/**
 * Calcula referência determinística pequena apenas para o subconjunto canônico suportado.
 * Não constitui um interpretador universal.
 */
function computeCanonicalReference(
  algo: CanonicalAlgorithmId,
  sampleInput: readonly number[],
  target?: number,
): { expectedResult: string; expectedStepCountHint: number; expectedComplexityWorst: string } {
  if (algo === "insertion_sort") {
    const arr = [...sampleInput];
    let steps = 1;
    for (let i = 1; i < arr.length; i += 1) {
      const key = arr[i]!;
      let j = i - 1;
      while (j >= 0 && arr[j]! > key) {
        arr[j + 1] = arr[j]!;
        j -= 1;
      }
      arr[j + 1] = key;
      steps += 1;
    }
    return {
      expectedResult: JSON.stringify(arr),
      expectedStepCountHint: steps,
      expectedComplexityWorst: "O(n^2)",
    };
  }

  if (algo === "linear_search") {
    const idx = target === undefined ? -1 : sampleInput.indexOf(target);
    return {
      expectedResult: String(idx),
      expectedStepCountHint: idx >= 0 ? idx + 1 : Math.max(1, sampleInput.length),
      expectedComplexityWorst: "O(n)",
    };
  }

  // binary_search (assume entrada ordenada)
  const arr = [...sampleInput];
  let low = 0;
  let high = arr.length - 1;
  let found = -1;
  let steps = 0;
  while (low <= high) {
    steps += 1;
    const mid = Math.floor((low + high) / 2);
    if (arr[mid] === target) {
      found = mid;
      break;
    }
    if (target !== undefined && arr[mid]! < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return {
    expectedResult: String(found),
    expectedStepCountHint: Math.max(1, steps),
    expectedComplexityWorst: "O(log n)",
  };
}

/**
 * Adaptador puro (sem efeitos colaterais) que prepara o snapshot do algoritmo e,
 * quando aplicável ao subconjunto canônico, fornece a fonte de verdade determinística.
 */
export function buildAlgorithmTraceSnapshot(input: {
  readonly algorithmName: string;
  readonly canonicalAlgorithm?: CanonicalAlgorithmId;
  readonly dataStructure?: string;
  readonly sampleInput: readonly number[];
  readonly target?: number;
}): AlgorithmTraceSnapshot {
  const inputCopy = [...input.sampleInput];
  if (input.canonicalAlgorithm) {
    const ref = computeCanonicalReference(input.canonicalAlgorithm, inputCopy, input.target);
    const contextSummary = [
      `CsAlgorithms (referência determinística): algo=${input.algorithmName} (${input.canonicalAlgorithm}), input=${JSON.stringify(inputCopy)}${input.target !== undefined ? `, target=${input.target}` : ""}, expectedOutput=${ref.expectedResult}, worstCase=${ref.expectedComplexityWorst}.`,
      "Restrição IE-4E: especificações declarativas (sem executar código ou renderizar diagramas).",
    ].join("\n");
    return {
      algorithmName: input.algorithmName,
      canonicalAlgorithm: input.canonicalAlgorithm,
      dataStructure: input.dataStructure,
      sampleInput: inputCopy,
      target: input.target,
      hasDeterministicReference: true,
      expectedResult: ref.expectedResult,
      expectedStepCountHint: ref.expectedStepCountHint,
      expectedComplexityWorst: ref.expectedComplexityWorst,
      contextSummary,
    };
  }

  const contextSummary = [
    `CsAlgorithms (escopo estrutural): algo=${input.algorithmName}, input=${JSON.stringify(inputCopy)}.`,
    "Restrição IE-4E: sem validação semântica universal; especificações declarativas apenas.",
  ].join("\n");

  return {
    algorithmName: input.algorithmName,
    dataStructure: input.dataStructure,
    sampleInput: inputCopy,
    target: input.target,
    hasDeterministicReference: false,
    contextSummary,
  };
}

export function validateCsAlgorithmsOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: CsAlgorithmsOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as CsAlgorithmsOutput;
  } catch {
    return { valid: false, errors: ["A saída de cs.algorithms não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de cs.algorithms deve ser um objeto JSON."] };
  }

  if (typeof parsed.algorithmName !== "string" || !parsed.algorithmName.trim()) {
    errors.push("Campo 'algorithmName' deve ser preenchido.");
  }
  if (typeof parsed.explanation !== "string" || parsed.explanation.trim().length < 15) {
    errors.push("Campo 'explanation' deve conter explicação clara do algoritmo.");
  }
  if (typeof parsed.inputSummary !== "string" || !parsed.inputSummary.trim()) {
    errors.push("Campo 'inputSummary' deve descrever os dados de entrada.");
  }
  if (typeof parsed.expectedOutput !== "string" || !parsed.expectedOutput.trim()) {
    errors.push("Campo 'expectedOutput' deve ser preenchido.");
  }
  if (parsed.declarativeOnly !== true) {
    errors.push("Campo 'declarativeOnly' deve ser true na Onda 2.");
  }
  if (
    parsed.deterministicVerificationScope !== "canonical_subset" &&
    parsed.deterministicVerificationScope !== "structural_only"
  ) {
    errors.push("Campo 'deterministicVerificationScope' deve ser 'canonical_subset' ou 'structural_only'.");
  }

  if (!Array.isArray(parsed.traceSteps) || parsed.traceSteps.length === 0) {
    errors.push("Campo 'traceSteps' deve conter ao menos uma etapa de traço de execução.");
  } else {
    parsed.traceSteps.forEach((st, idx) => {
      if (!st || st.step !== idx + 1) {
        errors.push(`traceSteps[${idx}].step deve ser sequencial (esperado ${idx + 1}).`);
      }
      if (!st || typeof st.action !== "string" || !st.action.trim()) {
        errors.push(`traceSteps[${idx}] exige 'action'.`);
      }
      if (!st || typeof st.intermediateState !== "string" || !st.intermediateState.trim()) {
        errors.push(`traceSteps[${idx}] exige 'intermediateState'.`);
      }
    });
  }

  if (
    !parsed.complexity ||
    typeof parsed.complexity.timeWorst !== "string" ||
    !parsed.complexity.timeWorst.trim() ||
    typeof parsed.complexity.space !== "string" ||
    !parsed.complexity.space.trim()
  ) {
    errors.push("Campo 'complexity' exige 'timeWorst' e 'space'.");
  }

  if (parsed.complementaryDiagram) {
    const diag = parsed.complementaryDiagram;
    if (diag.modality !== "mermaid" && diag.modality !== "text_fallback") {
      errors.push("complementaryDiagram.modality deve ser 'mermaid' ou 'text_fallback'.");
    }
    if (diag.status !== "specification_only" && diag.status !== "textual_fallback") {
      errors.push("complementaryDiagram.status deve ser 'specification_only' ou 'textual_fallback'.");
    }
    if (typeof diag.content !== "string" || !diag.content.trim()) {
      errors.push("complementaryDiagram.content deve ser preenchido.");
    } else if (diag.modality === "mermaid" && !MERMAID_HEADER_PATTERN.test(diag.content)) {
      errors.push("Diagrama Mermaid deve iniciar com cabeçalho Mermaid válido.");
    }
  }

  const allText = [
    parsed.explanation ?? "",
    parsed.inputSummary ?? "",
    parsed.expectedOutput ?? "",
    ...(Array.isArray(parsed.traceSteps) ? parsed.traceSteps.map((s) => `${s?.action ?? ""} ${s?.intermediateState ?? ""}`) : []),
    parsed.complementaryDiagram?.content ?? "",
  ].join("\n");

  if (DANGEROUS_CONTENT_PATTERN.test(allText)) {
    errors.push(
      "Conteúdo bloqueado por segurança (PS-1a/PS-1b): HTML executável, script, link javascript:, eval ou imagem remota Markdown.",
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validação contextual determinística do traço para o subconjunto canônico suportado.
 */
export function validateCsAlgorithmsAgainstSnapshot(
  parsed: CsAlgorithmsOutput,
  snapshot: AlgorithmTraceSnapshot,
): SkillValidationResult {
  const errors: string[] = [];

  if (!snapshot.hasDeterministicReference) {
    if (parsed.deterministicVerificationScope === "canonical_subset") {
      errors.push(
        "Não é permitido declarar deterministicVerificationScope='canonical_subset' sem referência determinística no snapshot.",
      );
    }
    return { valid: errors.length === 0, errors };
  }

  // Verifica coerência do resultado esperado com a fonte de verdade determinística
  const normExpected = (snapshot.expectedResult ?? "").replace(/\s+/g, "");
  const normOutput = parsed.expectedOutput.replace(/\s+/g, "");
  if (normExpected && !normOutput.includes(normExpected)) {
    errors.push(
      `Resultado esperado divergente da referência determinística: esperado conter "${snapshot.expectedResult}", recebido "${parsed.expectedOutput}".`,
    );
  }

  // Para entrada vazia, impede inventar estados com elementos inexistentes no array
  if (snapshot.sampleInput.length === 0) {
    const lastState = parsed.traceSteps[parsed.traceSteps.length - 1]?.intermediateState ?? "";
    if (/\[\s*\d+/.test(lastState)) {
      errors.push("Para entrada vazia ([]), o traço não pode inventar elementos numéricos no estado intermediário.");
    }
  }

  // Quando há complexidade de pior caso canônica conhecida, valida coerência
  if (snapshot.expectedComplexityWorst) {
    const normWorst = snapshot.expectedComplexityWorst.toLowerCase().replace(/\s+/g, "");
    const gotWorst = parsed.complexity.timeWorst.toLowerCase().replace(/\s+/g, "");
    if (!gotWorst.includes(normWorst)) {
      errors.push(
        `Complexidade de pior caso divergente da referência: esperado "${snapshot.expectedComplexityWorst}", recebido "${parsed.complexity.timeWorst}".`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export const csAlgorithmsSkillSpec: SkillSpec = {
  id: "cs.algorithms",
  version: "0.1.0",
  objective:
    "Ensinar algoritmos e estruturas de dados com traço de execução passo a passo, estados intermediários, análise de complexidade e diagrama declarativo seguro.",
  triggers: [
    {
      type: "action",
      value: "trace_algorithm",
      description: "Explicação com traço de execução passo a passo de algoritmos e estruturas de dados.",
    },
    {
      type: "intent",
      value: "explain_algorithm_trace",
      description: "Estudante pede explicação passo a passo e complexidade de um algoritmo.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        algorithmName: { type: "string" },
        sampleInput: { type: "string" },
        dataStructure: { type: "string" },
        algorithmSummary: { type: "string" },
      },
      required: ["algorithmName"],
    },
    required: ["algorithmName"],
  },
  output: {
    type: "json",
    requiredKeys: [
      "algorithmName",
      "explanation",
      "inputSummary",
      "traceSteps",
      "expectedOutput",
      "complexity",
      "declarativeOnly",
      "deterministicVerificationScope",
    ],
    formatDescription:
      'JSON estrito: { algorithmName, dataStructure?, explanation, inputSummary, traceSteps: [{ step, action, intermediateState }], expectedOutput, complexity: { timeBest?, timeAverage?, timeWorst, space }, complementaryDiagram?: { modality: "mermaid"|"text_fallback", status: "specification_only"|"textual_fallback", content }, declarativeOnly: true, deterministicVerificationScope: "canonical_subset"|"structural_only" }.',
    validator: validateCsAlgorithmsOutput,
  },
  allowedContext: ["study", "chunks", "profile"],
  allowedTools: ["js_execution", "diagram"],
  tokenBudget: {
    input: 3000,
    output: 900,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: false,
    requiresContextualValidation: true,
    forbiddenOutputs: [
      "HTML executável, scripts, links javascript: ou imagens remotas Markdown",
      "estados intermediários incompatíveis com a referência determinística",
      "alegação de verificação semântica universal para algoritmos arbitrários",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Apresentar traço sequencial com estados intermediários claros para entradas pequenas.",
      "Diferenciar complexidade temporal (casos) e espacial.",
      "Validar traço contra referência determinística no subconjunto canônico suportado.",
      "Manter diagramas e execução estritamente declarativos (declarativeOnly=true).",
    ],
    maxOutputWords: 650,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: CS_ALGORITHMS_FALLBACK_JSON,
    description: "Traço genérico seguro em JSON com diagrama textual de fallback.",
  },
};
