/**
 * StudyAI — Tool Engine (TE-5)
 * Ferramenta canônica de execução restrita de JavaScript (`js_execution@0.1.0`).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §3–§5 e §7:
 * - Classe oficial: `execution` (`requiresConfirmation: false` — sem escrita em storages).
 * - Reutiliza exclusivamente `SafeExecutionService.ts` e o Web Worker endurecido
 *   (`/api/lab/js-worker` com CSP `connect-src 'none'; worker-src 'none'`).
 * - Vinculada a `SessionOperationManager`: troca de sessão A->B ou suspensão aciona
 *   `AbortSignal` e encerra o Worker imediatamente via `worker.terminate()`.
 * - Diferencia explicitamente `wasExecuted` (true somente após execução real no Worker)
 *   de rejeição estática ou ambiente sem Worker (`unavailable_in_environment`).
 */

import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import {
  DEFAULT_JS_MAX_OUTPUT_BYTES,
  DEFAULT_JS_MAX_OUTPUT_LINES,
  DEFAULT_JS_TIMEOUT_MS,
  SafeExecutionService,
  type RestrictedJsExecutionResult,
  type RestrictedJsOptions,
} from "@/features/lab/services/SafeExecutionService";
import type { ToolExecutorFn, ToolSpec } from "../types";

export const JS_EXECUTION_MAX_CODE_CHARS = 4_000;
export const JS_EXECUTION_MAX_TIMEOUT_MS = DEFAULT_JS_TIMEOUT_MS;

export interface JsExecutionToolOutput {
  readonly executionState:
    | "executed"
    | "static_rejected"
    | "runtime_error"
    | "timeout"
    | "unavailable_in_environment";
  readonly wasExecuted: boolean;
  readonly deterministicResult: boolean;
  readonly workerTerminated: boolean;
  readonly truncated: boolean;
  readonly outputLines: readonly string[];
  readonly durationMs: number;
  readonly sanitizedError?: string;
}

export type RestrictedJsRunnerFn = (
  code: string,
  options: RestrictedJsOptions,
) => Promise<RestrictedJsExecutionResult>;

let activeJsRunner: RestrictedJsRunnerFn = (code, options) =>
  SafeExecutionService.runRestrictedJavaScript(code, options);

/**
 * Permite injetar runner controlado em testes Node sem alterar o caminho padrão
 * (`SafeExecutionService.runRestrictedJavaScript` em navegador real).
 */
export function setJsExecutionRunnerForTesting(runner: RestrictedJsRunnerFn | null): void {
  activeJsRunner =
    runner ?? ((code, options) => SafeExecutionService.runRestrictedJavaScript(code, options));
}

export const jsExecutionToolSpec: ToolSpec = {
  id: "js_execution",
  version: "0.1.0",
  class: "execution",
  description:
    "Executa trechos curtos de JavaScript educacional exclusivamente no Web Worker endurecido sem rede e sem acesso a storages, com timeout de até 2s.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["code"],
    properties: {
      code: {
        type: "string",
        minLength: 1,
        maxLength: JS_EXECUTION_MAX_CODE_CHARS,
        description: "Código JavaScript educacional puro sem acesso a rede, storages ou workers.",
      },
      timeoutMs: {
        type: "number",
        min: 100,
        max: JS_EXECUTION_MAX_TIMEOUT_MS,
        description: "Opcional: limite de tempo em milissegundos (máx. 2000ms).",
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "executionState",
      "wasExecuted",
      "deterministicResult",
      "workerTerminated",
      "truncated",
      "outputLines",
      "durationMs",
    ],
    properties: {
      executionState: {
        type: "string",
        enum: [
          "executed",
          "static_rejected",
          "runtime_error",
          "timeout",
          "unavailable_in_environment",
        ],
      },
      wasExecuted: { type: "boolean" },
      deterministicResult: { type: "boolean" },
      workerTerminated: { type: "boolean" },
      truncated: { type: "boolean" },
      outputLines: {
        type: "array",
        maxItems: DEFAULT_JS_MAX_OUTPUT_LINES,
        items: { type: "string", maxLength: 400 },
      },
      durationMs: { type: "number", min: 0, max: 10000 },
      sanitizedError: { type: "string", maxLength: 300 },
    },
  },
  scope: {
    requiredScopes: ["account"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 2500,
    maxInputBytes: 6144,
    maxOutputBytes: 6144,
    maxItems: DEFAULT_JS_MAX_OUTPUT_LINES,
    maxDepth: 4,
    maxCallsPerTurn: 2,
  },
  requiresConfirmation: false,
  audit: {
    recordDuration: true,
    includeStudentContent: false,
    allowedMetadataFields: ["toolId", "toolVersion", "toolClass", "status", "denialReason", "durationMs"],
  },
  tests: {
    deterministicFixtures: true,
    description:
      "Valida execução restrita no Worker real (sem rede/storages), timeout com terminate(), cancelamento em troca A->B e auditoria sanitizada.",
  },
  available: true,
};

export const executeJsExecutionTool: ToolExecutorFn = async (args, context) => {
  const code = typeof args.code === "string" ? args.code : "";
  const requestedTimeout =
    typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
      ? Math.max(100, Math.min(Math.round(args.timeoutMs), JS_EXECUTION_MAX_TIMEOUT_MS))
      : JS_EXECUTION_MAX_TIMEOUT_MS;

  const operation = SessionOperationManager.start(context.userId);
  try {
    operation.assertCurrent();
    const res = await activeJsRunner(code, {
      timeoutMs: requestedTimeout,
      signal: operation.signal,
      maxCodeLength: JS_EXECUTION_MAX_CODE_CHARS,
      maxOutputLines: DEFAULT_JS_MAX_OUTPUT_LINES,
      maxOutputBytes: DEFAULT_JS_MAX_OUTPUT_BYTES,
    });
    // Revalida sessão após conclusão assíncrona (descarta mensagens tardias após troca A->B)
    operation.assertCurrent();

    if (res.unavailableInEnvironment) {
      return {
        executionState: "unavailable_in_environment",
        wasExecuted: false,
        deterministicResult: false,
        workerTerminated: false,
        truncated: false,
        outputLines: [],
        durationMs: Math.max(0, res.durationMs),
        sanitizedError: res.error ?? "Web Worker indisponível neste ambiente.",
      } satisfies JsExecutionToolOutput as unknown as Record<string, unknown>;
    }

    if (res.staticRejected) {
      return {
        executionState: "static_rejected",
        wasExecuted: false,
        deterministicResult: false,
        workerTerminated: false,
        truncated: false,
        outputLines: [],
        durationMs: Math.max(0, res.durationMs),
        sanitizedError: res.error ?? "Código bloqueado pela validação estática de segurança.",
      } satisfies JsExecutionToolOutput as unknown as Record<string, unknown>;
    }

    if (res.timedOut) {
      return {
        executionState: "timeout",
        wasExecuted: true,
        deterministicResult: false,
        workerTerminated: res.workerTerminated,
        truncated: res.truncated,
        outputLines: [...res.output],
        durationMs: Math.max(0, res.durationMs),
        sanitizedError: res.error ?? "Execução interrompida por tempo limite.",
      } satisfies JsExecutionToolOutput as unknown as Record<string, unknown>;
    }

    if (res.status !== "success") {
      return {
        executionState: "runtime_error",
        wasExecuted: res.wasExecuted,
        deterministicResult: false,
        workerTerminated: res.workerTerminated,
        truncated: res.truncated,
        outputLines: [...res.output],
        durationMs: Math.max(0, res.durationMs),
        sanitizedError: res.error ?? "Erro durante a execução restrita.",
      } satisfies JsExecutionToolOutput as unknown as Record<string, unknown>;
    }

    return {
      executionState: "executed",
      wasExecuted: true,
      deterministicResult: true,
      workerTerminated: res.workerTerminated,
      truncated: res.truncated,
      outputLines: [...res.output],
      durationMs: Math.max(0, res.durationMs),
    } satisfies JsExecutionToolOutput as unknown as Record<string, unknown>;
  } finally {
    operation.release();
  }
};
