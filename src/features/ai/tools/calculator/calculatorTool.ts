/**
 * StudyAI — Tool Engine (TE-2)
 * Ferramenta Calculadora (`calculator@0.1.0`), classe `read`, execução local no cliente.
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §4 e §7:
 * - Reutiliza integralmente `MathLabService.ts` (parser AST seguro com limite de 40.000 caracteres).
 * - Zero `eval`, `new Function`, shell, rede, FS ou execução arbitrária de JS.
 * - Sem efeitos colaterais ou acesso a dados de outras contas.
 * - Permanece inacessível enquanto `tools.enabled = false`.
 */

import { MathLabService } from "@/features/lab/services/MathLabService";
import type { ToolRegistryImpl } from "../ToolRegistry";
import type { ToolExecutorFn, ToolSpec } from "../types";

export const CALCULATOR_MAX_EXPRESSION_LENGTH = 40_000;
export const CALCULATOR_MAX_INPUT_BYTES = 40_960;

export type CalculatorErrorCategory =
  | "syntax_error"
  | "unsupported_operation"
  | "invalid_domain"
  | "division_by_zero"
  | "non_finite_result"
  | "complexity_limit_exceeded"
  | "length_limit_exceeded"
  | "unknown_error";

export interface CalculatorToolOutput extends Record<string, unknown> {
  readonly status: "success" | "error";
  readonly expression: string;
  readonly numericResult?: number;
  readonly formattedResult?: string;
  readonly precision: "exact" | "approximate" | "not_applicable";
  readonly errorCategory?: CalculatorErrorCategory;
  readonly errorMessage?: string;
  readonly summary: string;
  readonly outputLines?: readonly string[];
}

const MALICIOUS_EXPRESSION_PATTERN =
  /(\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|<\s*script\b|javascript\s*:|\bimport\s*\(|\brequire\s*\(|\bprocess\.|\bwindow\.|\bglobalThis\.|\bfetch\s*\(|;|\bSELECT\b|\bDROP\b|\bINSERT\b|\bDELETE\b)/i;

const APPROXIMATE_FUNCTION_PATTERN =
  /\b(sin|cos|tan|asin|acos|atan|sqrt|ln|log|log10|exp|pi|e)\b/i;

function classifyMathError(expression: string, message: string): CalculatorErrorCategory {
  const lower = message.toLocaleLowerCase("pt-BR");
  if (lower.includes("40 mil caracteres")) return "length_limit_exceeded";
  if (lower.includes("muito complexa")) return "complexity_limit_exceeded";
  if (lower.includes("divisão por zero") || /\/\s*0(?:\.0+)?(?:\D|$)/.test(expression)) {
    return "division_by_zero";
  }
  if (lower.includes("não numérico") || lower.includes("infinito") || lower.includes("não finito")) {
    if (/\b(?:sqrt|ln|log|log10|asin|acos)\s*\(\s*-/.test(expression)) {
      return "invalid_domain";
    }
    return "non_finite_result";
  }
  if (lower.includes("não suportad") || lower.includes("desconhecid")) {
    return "unsupported_operation";
  }
  if (lower.includes("sintaxe") || lower.includes("inválid") || lower.includes("inesperado") || lower.includes("parêntese")) {
    return "syntax_error";
  }
  return "unknown_error";
}

function resolvePrecision(expression: string, numericResult: number): "exact" | "approximate" {
  if (Number.isInteger(numericResult) && !APPROXIMATE_FUNCTION_PATTERN.test(expression)) {
    return "exact";
  }
  if (APPROXIMATE_FUNCTION_PATTERN.test(expression)) {
    return "approximate";
  }
  // MathLabService.formatNumber arredonda em 4 casas decimais; se há 4 casas, sinaliza aproximação
  const decimalPart = String(numericResult).split(".")[1];
  if (decimalPart && decimalPart.length >= 4) {
    return "approximate";
  }
  return "exact";
}

/**
 * Adaptador puro e tipado sobre `MathLabService.execute`.
 * Nunca modifica silenciosamente a expressão e nunca devolve NaN/Infinity como válido.
 */
export const executeCalculatorTool: ToolExecutorFn = (args): CalculatorToolOutput => {
  const expression = typeof args.expression === "string" ? args.expression : "";
  const trimmed = expression.trim();

  if (!trimmed) {
    return {
      status: "error",
      expression,
      precision: "not_applicable",
      errorCategory: "syntax_error",
      errorMessage: "Informe uma expressão matemática não vazia.",
      summary: "Expressão vazia recusada pela calculadora.",
    };
  }

  if (expression.length > CALCULATOR_MAX_EXPRESSION_LENGTH) {
    return {
      status: "error",
      expression: expression.slice(0, 80),
      precision: "not_applicable",
      errorCategory: "length_limit_exceeded",
      errorMessage: "A especificação excede o limite de 40 mil caracteres.",
      summary: "Expressão recusada por exceder 40.000 caracteres.",
    };
  }

  if (MALICIOUS_EXPRESSION_PATTERN.test(expression)) {
    return {
      status: "error",
      expression,
      precision: "not_applicable",
      errorCategory: "unsupported_operation",
      errorMessage: "Expressão recusada por conter sintaxe não matemática ou potencialmente maliciosa.",
      summary: "Entrada maliciosa ou não matemática recusada antes da avaliação.",
    };
  }

  const res = MathLabService.execute(expression);
  if (res.status !== "success") {
    const errMsg = res.error || "Não foi possível avaliar a expressão matemática.";
    const category = classifyMathError(expression, errMsg);
    return {
      status: "error",
      expression,
      precision: "not_applicable",
      errorCategory: category,
      errorMessage: errMsg,
      summary: `Erro (${category}): ${errMsg}`,
    };
  }

  // Resultado escalar direto (métrica "Resultado" do MathLabService)
  const scalarMetric = res.metrics?.find((m) => m.label === "Resultado");
  if (scalarMetric) {
    const numeric = Number(scalarMetric.value);
    if (!Number.isFinite(numeric)) {
      return {
        status: "error",
        expression,
        precision: "not_applicable",
        errorCategory: "non_finite_result",
        errorMessage: "A expressão resultou em valor não finito (NaN ou Infinity).",
        summary: "Resultado não finito recusado.",
      };
    }

    const precision = resolvePrecision(expression, numeric);
    return {
      status: "success",
      expression,
      numericResult: numeric,
      formattedResult: scalarMetric.value,
      precision,
      summary: res.output[0] ?? `${expression} = ${scalarMetric.value}`,
      outputLines: res.output.slice(0, 10),
    };
  }

  // Simulação de função em intervalo suportada pelo MathLabService
  return {
    status: "success",
    expression,
    precision: "approximate",
    summary: res.output[0] ?? "Simulação matemática concluída pelo MathLabService.",
    outputLines: res.output.slice(0, 10),
  };
};

export const calculatorToolSpec: ToolSpec = {
  id: "calculator",
  version: "0.1.0",
  class: "read",
  description:
    "Avalia expressões matemáticas e simulações numéricas no cliente reutilizando o parser AST determinístico do MathLabService.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["expression"],
    properties: {
      expression: {
        type: "string",
        description: "Expressão matemática suportada pelo MathLabService (até 40.000 caracteres).",
        minLength: 1,
        maxLength: CALCULATOR_MAX_EXPRESSION_LENGTH,
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["status", "expression", "precision", "summary"],
    properties: {
      status: { type: "string", enum: ["success", "error"] },
      expression: { type: "string", maxLength: CALCULATOR_MAX_EXPRESSION_LENGTH },
      numericResult: { type: "number" },
      formattedResult: { type: "string", maxLength: 120 },
      precision: { type: "string", enum: ["exact", "approximate", "not_applicable"] },
      errorCategory: {
        type: "string",
        enum: [
          "syntax_error",
          "unsupported_operation",
          "invalid_domain",
          "division_by_zero",
          "non_finite_result",
          "complexity_limit_exceeded",
          "length_limit_exceeded",
          "unknown_error",
        ],
      },
      errorMessage: { type: "string", maxLength: 500 },
      summary: { type: "string", maxLength: 1000 },
      outputLines: {
        type: "array",
        maxItems: 20,
        items: { type: "string", maxLength: 500 },
      },
    },
  },
  scope: {
    requiredScopes: ["account"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 2_000,
    maxInputBytes: CALCULATOR_MAX_INPUT_BYTES,
    maxOutputBytes: 8_192,
    maxItems: 20,
    maxDepth: 4,
    maxCallsPerTurn: 3,
  },
  requiresConfirmation: false,
  audit: {
    recordDuration: true,
    includeStudentContent: false,
    allowedMetadataFields: ["toolId", "toolVersion", "status", "durationMs"],
  },
  tests: {
    deterministicFixtures: true,
    description: "Paridade direta com MathLabService.execute e recusa de entradas maliciosas.",
  },
  available: true,
};

export function registerCalculatorTool(registry: ToolRegistryImpl): void {
  if (!registry.has(calculatorToolSpec.id)) {
    registry.register(calculatorToolSpec, executeCalculatorTool);
  }
}
