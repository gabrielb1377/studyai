/**
 * StudyAI — Intelligence Engine (IE-4F)
 * Especificação pedagógica: math.step-by-step (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#6):
 * - Objetivo: Resolução em etapas com justificativa.
 * - Base existente: método `step_by_step` do Teacher (`TeacherPromptBuilder`) e `MathLabService.ts`.
 * - Ferramenta (fase): `calculator` (estritamente declarativa até TE-2 na Onda 3).
 * - Orçamento inicial: 2.500 entrada / 900 saída.
 *
 * Regras de segurança e limites de verificação:
 * - Reutiliza `MathLabService.execute` apenas para expressões numéricas suportadas (sem criar CAS).
 * - Diferencia resultado calculado deterministicamente, resultado proposto pela IA, verificação estrutural e verificação matemática.
 * - Nunca apresenta resultado aproximado como exato; explicita precisão quando aproximado.
 * - Detecta domínio inválido (ex.: divisão por zero, raiz negativa) via `MathLabService`.
 * - Nunca usa `eval`, `new Function` ou alega uso da ferramenta calculadora TE-2 (`calculatorToolUsed: false`).
 */

import { MathLabService } from "@/features/lab/services/MathLabService";
import type { SkillSpec, SkillValidationResult } from "../types";

export interface MathStepSnapshot {
  readonly problemStatement: string;
  readonly level: "beginner" | "intermediate" | "advanced";
  readonly problemSufficient: boolean;
  readonly domainStatus: "valid" | "invalid_domain" | "unverified";
  readonly domainError?: string;
  readonly deterministicExpression?: string;
  readonly deterministicResult?: number;
  readonly hasDeterministicVerification: boolean;
  readonly contextSummary: string;
}

export interface MathResolutionStep {
  readonly step: number;
  readonly transformation: string;
  readonly justification: string;
  readonly intermediateResult: string;
}

export interface MathVerificationMetadata {
  readonly kind: "math_lab_verified" | "structural_only" | "not_performed";
  /** Sempre false na Onda 2: a ferramenta calculadora da TE-2 permanece declarativa. */
  readonly calculatorToolUsed: boolean;
  readonly note: string;
}

export interface MathStepByStepOutput {
  readonly problemIdentification: string;
  readonly status: "solved" | "invalid_domain" | "insufficient_information";
  readonly knownData: readonly string[];
  readonly formulasUsed: readonly string[];
  readonly steps: readonly MathResolutionStep[];
  readonly finalResult: string;
  readonly resultPrecision: "exact" | "approximate" | "not_applicable";
  readonly approximationDetails?: string;
  readonly verification: MathVerificationMetadata;
}

export const MATH_STEP_BY_STEP_FALLBACK_JSON = JSON.stringify({
  problemIdentification: "Enunciado matemático incompleto ou não verificável neste momento.",
  status: "insufficient_information",
  knownData: [],
  formulasUsed: [],
  steps: [
    {
      step: 1,
      transformation: "Revisar os dados fornecidos e identificar a incógnita solicitada.",
      justification: "Sem valores ou condições completas não é seguro propor cálculo definitivo.",
      intermediateResult: "Dados insuficientes para cálculo.",
    },
  ],
  finalResult: "Não determinado: informe todos os valores, domínios e unidades do problema.",
  resultPrecision: "not_applicable",
  verification: {
    kind: "not_performed",
    calculatorToolUsed: false,
    note: "Fallback conservador acionado sem execução de calculadora externa.",
  },
} satisfies MathStepByStepOutput);

const UNSAFE_MATH_CONTENT = /(\beval\s*\(|\bnew\s+Function\s*\(|<\s*script\b|javascript\s*:)/i;

const FALSE_CALCULATOR_TOOL_CLAIM =
  /\b(executei\s+na\s+calculadora|chamei\s+a\s+ferramenta\s+calculator|usei\s+a\s+ferramenta\s+te-2)\b/i;

/**
 * Adaptador puro (sem efeitos colaterais) que reutiliza `MathLabService.execute`
 * exclusivamente para expressões numéricas suportadas.
 */
export function buildMathStepSnapshot(input: {
  readonly problemStatement: string;
  readonly deterministicExpression?: string;
  readonly level?: "beginner" | "intermediate" | "advanced";
}): MathStepSnapshot {
  const level = input.level ?? "intermediate";
  const trimmedProblem = input.problemStatement.trim();
  const problemSufficient = trimmedProblem.length >= 5;

  if (!problemSufficient) {
    return {
      problemStatement: trimmedProblem,
      level,
      problemSufficient: false,
      domainStatus: "unverified",
      hasDeterministicVerification: false,
      contextSummary: `MathStepByStep: level=${level}, problemSufficient=false (enunciado insuficiente).`,
    };
  }

  const expr = input.deterministicExpression?.trim();
  if (expr) {
    const res = MathLabService.execute(expr);
    if (res.status === "error") {
      return {
        problemStatement: trimmedProblem,
        level,
        problemSufficient: true,
        domainStatus: "invalid_domain",
        domainError: res.error ?? "Domínio matemático inválido ou operação não definida.",
        deterministicExpression: expr,
        hasDeterministicVerification: true,
        contextSummary: `MathStepByStep (MathLabService): expression="${expr}", domainStatus=invalid_domain, error="${res.error ?? "erro de domínio"}".`,
      };
    }

    const metricVal = res.metrics?.[0]?.value;
    const numericVal = metricVal !== undefined ? Number(metricVal) : Number.NaN;
    if (Number.isFinite(numericVal)) {
      return {
        problemStatement: trimmedProblem,
        level,
        problemSufficient: true,
        domainStatus: "valid",
        deterministicExpression: expr,
        deterministicResult: numericVal,
        hasDeterministicVerification: true,
        contextSummary: `MathStepByStep (MathLabService): expression="${expr}", domainStatus=valid, deterministicResult=${numericVal}.`,
      };
    }
  }

  return {
    problemStatement: trimmedProblem,
    level,
    problemSufficient: true,
    domainStatus: "unverified",
    hasDeterministicVerification: false,
    contextSummary: `MathStepByStep: level=${level}, domainStatus=unverified (sem verificação determinística automática; ferramenta calculator permanece declarativa).`,
  };
}

function extractFirstNumber(text: string): number | null {
  const normalized = text.replace(/,/g, ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateMathStepOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: MathStepByStepOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as MathStepByStepOutput;
  } catch {
    return { valid: false, errors: ["A saída de math.step-by-step não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de math.step-by-step deve ser um objeto JSON."] };
  }

  if (typeof parsed.problemIdentification !== "string" || !parsed.problemIdentification.trim()) {
    errors.push("Campo 'problemIdentification' deve ser preenchido.");
  }
  if (
    parsed.status !== "solved" &&
    parsed.status !== "invalid_domain" &&
    parsed.status !== "insufficient_information"
  ) {
    errors.push("Campo 'status' deve ser 'solved', 'invalid_domain' ou 'insufficient_information'.");
  }
  if (!Array.isArray(parsed.knownData)) {
    errors.push("Campo 'knownData' deve ser um array.");
  }
  if (!Array.isArray(parsed.formulasUsed)) {
    errors.push("Campo 'formulasUsed' deve ser um array.");
  }
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    errors.push("Campo 'steps' deve conter ao menos uma etapa.");
  } else {
    parsed.steps.forEach((st, idx) => {
      if (!st || st.step !== idx + 1) {
        errors.push(`steps[${idx}].step deve ser sequencial (esperado ${idx + 1}).`);
      }
      if (!st || typeof st.transformation !== "string" || !st.transformation.trim()) {
        errors.push(`steps[${idx}] exige 'transformation'.`);
      }
      if (!st || typeof st.justification !== "string" || !st.justification.trim()) {
        errors.push(`steps[${idx}] exige 'justification'.`);
      }
      if (!st || typeof st.intermediateResult !== "string" || !st.intermediateResult.trim()) {
        errors.push(`steps[${idx}] exige 'intermediateResult'.`);
      }
    });
  }

  if (typeof parsed.finalResult !== "string" || !parsed.finalResult.trim()) {
    errors.push("Campo 'finalResult' deve ser preenchido.");
  }
  if (
    parsed.resultPrecision !== "exact" &&
    parsed.resultPrecision !== "approximate" &&
    parsed.resultPrecision !== "not_applicable"
  ) {
    errors.push("Campo 'resultPrecision' inválido.");
  }
  if (
    parsed.resultPrecision === "approximate" &&
    (typeof parsed.approximationDetails !== "string" || !parsed.approximationDetails.trim())
  ) {
    errors.push("Quando resultPrecision='approximate', 'approximationDetails' deve explicitar a precisão/arredondamento.");
  }

  if (!parsed.verification || typeof parsed.verification !== "object") {
    errors.push("Campo 'verification' é obrigatório.");
  } else {
    if (
      parsed.verification.kind !== "math_lab_verified" &&
      parsed.verification.kind !== "structural_only" &&
      parsed.verification.kind !== "not_performed"
    ) {
      errors.push("verification.kind inválido.");
    }
    if (parsed.verification.calculatorToolUsed !== false) {
      errors.push("verification.calculatorToolUsed deve ser false na Onda 2 (calculadora TE-2 é declarativa).");
    }
    if (typeof parsed.verification.note !== "string" || !parsed.verification.note.trim()) {
      errors.push("verification.note deve ser preenchido.");
    }
  }

  const allText = [
    parsed.problemIdentification ?? "",
    parsed.finalResult ?? "",
    parsed.approximationDetails ?? "",
    parsed.verification?.note ?? "",
    ...(Array.isArray(parsed.steps)
      ? parsed.steps.map((s) => `${s?.transformation ?? ""} ${s?.justification ?? ""} ${s?.intermediateResult ?? ""}`)
      : []),
  ].join("\n");

  if (UNSAFE_MATH_CONTENT.test(allText)) {
    errors.push("Conteúdo bloqueado por segurança: eval, new Function ou script não são permitidos.");
  }
  if (FALSE_CALCULATOR_TOOL_CLAIM.test(allText)) {
    errors.push("A skill não pode alegar que invocou a ferramenta calculadora externa TE-2.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validação contextual determinística contra o snapshot do `MathLabService`.
 */
export function validateMathStepAgainstSnapshot(
  parsed: MathStepByStepOutput,
  snapshot: MathStepSnapshot,
): SkillValidationResult {
  const errors: string[] = [];

  if (!snapshot.problemSufficient && parsed.status !== "insufficient_information") {
    errors.push("Enunciado insuficiente exige status='insufficient_information'.");
  }

  if (snapshot.domainStatus === "invalid_domain" && parsed.status !== "invalid_domain") {
    errors.push(
      `Domínio inválido detectado pelo MathLabService (${snapshot.domainError ?? "erro"}); esperado status='invalid_domain', recebido '${parsed.status}'.`,
    );
  }

  if (!snapshot.hasDeterministicVerification && parsed.verification.kind === "math_lab_verified") {
    errors.push("Não é permitido declarar verification.kind='math_lab_verified' sem verificação determinística no snapshot.");
  }

  if (snapshot.domainStatus === "valid" && snapshot.deterministicResult !== undefined) {
    if (parsed.status !== "solved") {
      errors.push(`Expressão válida no MathLabService exige status='solved', recebido '${parsed.status}'.`);
    } else {
      const gotNumber = extractFirstNumber(parsed.finalResult);
      if (gotNumber === null) {
        errors.push(`Não foi possível confirmar valor numérico compatível em finalResult="${parsed.finalResult}".`);
      } else {
        const diff = Math.abs(gotNumber - snapshot.deterministicResult);
        const tolerance = parsed.resultPrecision === "approximate" ? 0.05 : 1e-6;
        if (diff > tolerance) {
          errors.push(
            `Resultado matemático divergente do MathLabService: esperado ${snapshot.deterministicResult}, recebido ${gotNumber} (precisão=${parsed.resultPrecision}).`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export const mathStepByStepSkillSpec: SkillSpec = {
  id: "math.step-by-step",
  version: "0.1.0",
  objective:
    "Conduzir resolução matemática em etapas sequenciais com justificativa de cada transformação, preservando domínios, precisão e validação determinística no subconjunto suportado pelo MathLabService.",
  triggers: [
    {
      type: "action",
      value: "math_step_by_step",
      description: "Resolução passo a passo com justificativa no Tutor/Professor/Lab.",
    },
    {
      type: "intent",
      value: "solve_math_with_steps",
      description: "Estudante solicita a resolução detalhada de um problema matemático.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        problemStatement: { type: "string" },
        level: { type: "string" },
        mathSummary: { type: "string" },
      },
      required: ["problemStatement"],
    },
    required: ["problemStatement"],
  },
  output: {
    type: "json",
    requiredKeys: [
      "problemIdentification",
      "status",
      "knownData",
      "formulasUsed",
      "steps",
      "finalResult",
      "resultPrecision",
      "verification",
    ],
    formatDescription:
      'JSON estrito: { problemIdentification, status: "solved"|"invalid_domain"|"insufficient_information", knownData: string[], formulasUsed: string[], steps: [{ step, transformation, justification, intermediateResult }], finalResult, resultPrecision: "exact"|"approximate"|"not_applicable", approximationDetails?, verification: { kind: "math_lab_verified"|"structural_only"|"not_performed", calculatorToolUsed: false, note } }.',
    validator: validateMathStepOutput,
  },
  allowedContext: ["study", "chunks", "profile"],
  allowedTools: ["calculator"],
  tokenBudget: {
    input: 2500,
    output: 900,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: false,
    forbiddenOutputs: [
      "uso de eval, new Function ou scripts",
      "alegação falsa de uso da ferramenta calculadora TE-2",
      "resultado aproximado apresentado como exato",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Apresentar etapas sequenciais numeradas com justificativa de cada transformação.",
      "Explicitar precisão quando houver arredondamento (approximationDetails).",
      "Detectar e rejeitar operações em domínio inválido (ex.: divisão por zero).",
      "Diferenciar verificação matemática (math_lab_verified) de verificação estrutural.",
    ],
    maxOutputWords: 650,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: MATH_STEP_BY_STEP_FALLBACK_JSON,
    description: "Resposta conservadora em JSON indicando dados insuficientes sem acionar calculadora.",
  },
};
