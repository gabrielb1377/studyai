import { DataLabService } from "./DataLabService";
import { MathLabService } from "./MathLabService";
import { validateExecutableCode } from "../validators/lab-validation";
import type { LabExecutionResult, LabLanguage } from "../types";

export const HARDENED_JS_WORKER_CSP =
  "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'; child-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; style-src 'none'";

export const JS_WORKER_ENDPOINT = "/api/lab/js-worker";
export const MAX_CONCURRENT_JS_WORKERS = 2;
export const DEFAULT_JS_TIMEOUT_MS = 2_000;
export const DEFAULT_JS_MAX_OUTPUT_LINES = 40;
export const DEFAULT_JS_MAX_LINE_CHARS = 400;
export const DEFAULT_JS_MAX_OUTPUT_BYTES = 4_096;

export interface RestrictedJsOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly maxOutputLines?: number;
  readonly maxLineChars?: number;
  readonly maxOutputBytes?: number;
  readonly maxCodeLength?: number;
  /** Permite bypass da pré-checagem estática apenas em testes controlados de isolamento real do Worker. */
  readonly skipStaticCheckForSecurityTest?: boolean;
}

export interface RestrictedJsExecutionResult {
  readonly status: "success" | "error";
  readonly wasExecuted: boolean;
  readonly staticRejected: boolean;
  readonly unavailableInEnvironment: boolean;
  readonly workerTerminated: boolean;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly truncated: boolean;
  readonly output: readonly string[];
  readonly error?: string;
  readonly durationMs: number;
  readonly createdAt: string;
}

let activeWorkerCount = 0;

function result(
  status: LabExecutionResult["status"],
  started: number,
  output: string[],
  error?: string,
): LabExecutionResult {
  return {
    status,
    output,
    error,
    durationMs: Math.round(performance.now() - started),
    createdAt: new Date().toISOString(),
  };
}

function sanitizeExecutionError(raw: unknown): string {
  const message = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : "Erro de execução.";
  return message
    .replace(/https?:\/\/[^\s)]+/gi, "[url-removida]")
    .replace(/[A-Za-z]:\\[^\s)]+/g, "[caminho-removido]")
    .replace(/\/(?:home|Users|var|tmp|etc|app)\/[^\s)]+/g, "[caminho-removido]")
    .slice(0, 260);
}

/**
 * Script de bootstrap do Worker endurecido (compartilhado entre `/api/lab/js-worker` com CSP HTTP
 * rígido e o fallback `blob:` quando não há origem HTTP).
 *
 * Defesa em profundidade:
 * 1. Captura referências privadas de `postMessage`, `addEventListener` e `close` antes de neutralizar globals.
 * 2. Percorre TODA a cadeia de protótipos de `self` e `navigator` bloqueando APIs de rede, storages,
 *    workers, IPC, credenciais e sensores com `{ value: undefined, writable: false, configurable: false }`.
 * 3. Executa o código em `"use strict"` com escopo sombreado e console limitado em linhas/bytes.
 * 4. Envia no máximo 1 mensagem estruturada pelo canal privado e chama `_close()` imediatamente.
 */
export function buildHardenedWorkerBootstrapScript(): string {
  return `"use strict";
(function () {
  const _postMessage = self.postMessage.bind(self);
  const _close = self.close.bind(self);
  const _addEventListener = self.addEventListener.bind(self);
  const _removeEventListener = self.removeEventListener.bind(self);

  const SELF_BLOCKLIST = [
    "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts",
    "WebTransport", "RTCPeerConnection", "RTCSessionDescription", "RTCIceCandidate",
    "Request", "Response", "Headers",
    "indexedDB", "IDBFactory", "IDBDatabase", "caches", "CacheStorage",
    "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "MessagePort", "ServiceWorker",
    "postMessage", "onmessage", "onmessageerror", "addEventListener", "removeEventListener", "dispatchEvent",
    "close", "open", "cookieStore", "CookieStore",
    "FileReaderSync", "FileSystemSyncAccessHandle", "webkitRequestFileSystem", "requestFileSystem",
    "showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker",
    "PerformanceObserver", "ReportingObserver"
  ];

  const NAVIGATOR_BLOCKLIST = [
    "storage", "sendBeacon", "locks", "serviceWorker", "credentials", "permissions",
    "clipboard", "geolocation", "mediaDevices", "usb", "bluetooth", "serial",
    "hid", "gpu", "wakeLock", "connection"
  ];

  function lockDownChain(root, names) {
    if (!root || (typeof root !== "object" && typeof root !== "function")) return;
    const targets = [];
    let current = root;
    while (current && current !== Object.prototype) {
      targets.push(current);
      try {
        current = Object.getPrototypeOf(current);
      } catch {
        break;
      }
    }
    for (const target of targets) {
      for (const name of names) {
        try {
          Object.defineProperty(target, name, {
            value: undefined,
            writable: false,
            configurable: false,
          });
        } catch {
          try {
            delete target[name];
          } catch {}
          try {
            target[name] = undefined;
          } catch {}
        }
      }
    }
  }

  let handled = false;
  function onRun(event) {
    if (handled) return;
    handled = true;
    try {
      _removeEventListener("message", onRun);
    } catch {}

    const payload = event && typeof event.data === "object" && event.data ? event.data : {};
    const userCode = typeof payload.code === "string" ? payload.code : "";
    const maxOutputLines = typeof payload.maxOutputLines === "number" ? Math.max(1, Math.min(100, payload.maxOutputLines)) : 40;
    const maxLineChars = typeof payload.maxLineChars === "number" ? Math.max(20, Math.min(1000, payload.maxLineChars)) : 400;
    const maxOutputBytes = typeof payload.maxOutputBytes === "number" ? Math.max(128, Math.min(16384, payload.maxOutputBytes)) : 4096;

    // Neutraliza toda a cadeia de protótipos ANTES de compilar/executar o código do aluno
    lockDownChain(self, SELF_BLOCKLIST);
    if (typeof navigator !== "undefined") {
      lockDownChain(navigator, NAVIGATOR_BLOCKLIST);
    }

    const output = [];
    let totalBytes = 0;
    let truncated = false;

    const show = (value) => {
      try {
        return typeof value === "string" ? value : JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    const pushLine = (rawLine) => {
      if (output.length >= maxOutputLines || totalBytes >= maxOutputBytes) {
        truncated = true;
        return;
      }
      let line = String(rawLine);
      if (line.length > maxLineChars) {
        line = line.slice(0, maxLineChars - 3) + "...";
        truncated = true;
      }
      const remaining = maxOutputBytes - totalBytes;
      if (line.length > remaining) {
        line = line.slice(0, Math.max(0, remaining));
        truncated = true;
      }
      if (line.length > 0 || rawLine === "") {
        output.push(line);
        totalBytes += line.length;
      }
    };

    const safeConsole = Object.freeze({
      log: (...values) => pushLine(values.map(show).join(" ")),
      info: (...values) => pushLine(values.map(show).join(" ")),
      warn: (...values) => pushLine(values.map(show).join(" ")),
      error: (...values) => pushLine(values.map(show).join(" ")),
    });

    try {
      const fn = new Function(
        "console",
        "self",
        "globalThis",
        "window",
        "navigator",
        "location",
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
        "importScripts",
        "indexedDB",
        "caches",
        "Worker",
        "SharedWorker",
        "BroadcastChannel",
        "postMessage",
        "cookieStore",
        '"use strict";\\n' + userCode
      );
      const value = fn.call(
        undefined,
        safeConsole,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );
      if (value !== undefined) {
        pushLine(show(value));
      }
      _postMessage({ ok: true, output, truncated });
    } catch (error) {
      const msg = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      _postMessage({ ok: false, output, truncated, error: msg });
    } finally {
      try {
        _close();
      } catch {}
    }
  }

  _addEventListener("message", onRun);
  _postMessage({ __workerReady: true });
})();
`;
}

function canUseHttpWorkerEndpoint(): boolean {
  if (typeof window === "undefined") return false;
  const protocol = window.location?.protocol;
  return protocol === "http:" || protocol === "https:";
}

function clampHostOutput(
  rawLines: unknown,
  maxLines: number,
  maxLineChars: number,
  maxBytes: number,
): { lines: string[]; truncated: boolean } {
  if (!Array.isArray(rawLines)) return { lines: [], truncated: false };
  const lines: string[] = [];
  let totalBytes = 0;
  let truncated = false;
  for (const item of rawLines) {
    if (lines.length >= maxLines || totalBytes >= maxBytes) {
      truncated = true;
      break;
    }
    let text = typeof item === "string" ? item : String(item);
    if (text.length > maxLineChars) {
      text = `${text.slice(0, maxLineChars - 3)}...`;
      truncated = true;
    }
    const remaining = maxBytes - totalBytes;
    if (text.length > remaining) {
      text = text.slice(0, Math.max(0, remaining));
      truncated = true;
    }
    lines.push(text);
    totalBytes += text.length;
  }
  return { lines, truncated };
}

export const SafeExecutionService = {
  /**
   * Executa JavaScript restrito exclusivamente no Web Worker endurecido,
   * com suporte a `AbortSignal`, encerramento real via `worker.terminate()`,
   * limite de concorrência, limite de mensagens (máx. 1) e truncamento de saída.
   */
  async runRestrictedJavaScript(
    code: string,
    options: RestrictedJsOptions = {},
  ): Promise<RestrictedJsExecutionResult> {
    const started = performance.now();
    const createdAt = new Date().toISOString();
    const maxCodeLength = options.maxCodeLength ?? 40_000;
    const timeoutMs = Math.max(100, Math.min(options.timeoutMs ?? DEFAULT_JS_TIMEOUT_MS, DEFAULT_JS_TIMEOUT_MS));
    const maxOutputLines = options.maxOutputLines ?? DEFAULT_JS_MAX_OUTPUT_LINES;
    const maxLineChars = options.maxLineChars ?? DEFAULT_JS_MAX_LINE_CHARS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_JS_MAX_OUTPUT_BYTES;

    if (typeof code !== "string" || !code.trim()) {
      return {
        status: "error",
        wasExecuted: false,
        staticRejected: true,
        unavailableInEnvironment: false,
        workerTerminated: false,
        timedOut: false,
        cancelled: false,
        truncated: false,
        output: [],
        error: "Código JavaScript vazio.",
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    }

    if (code.length > maxCodeLength) {
      return {
        status: "error",
        wasExecuted: false,
        staticRejected: true,
        unavailableInEnvironment: false,
        workerTerminated: false,
        timedOut: false,
        cancelled: false,
        truncated: false,
        output: [],
        error: `O código excede o limite seguro de ${maxCodeLength} caracteres.`,
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    }

    if (!options.skipStaticCheckForSecurityTest) {
      const invalid = validateExecutableCode("javascript", code);
      if (invalid) {
        return {
          status: "error",
          wasExecuted: false,
          staticRejected: true,
          unavailableInEnvironment: false,
          workerTerminated: false,
          timedOut: false,
          cancelled: false,
          truncated: false,
          output: [],
          error: invalid,
          durationMs: Math.round(performance.now() - started),
          createdAt,
        };
      }
    }

    if (options.signal?.aborted) {
      return {
        status: "error",
        wasExecuted: false,
        staticRejected: false,
        unavailableInEnvironment: false,
        workerTerminated: false,
        timedOut: false,
        cancelled: true,
        truncated: false,
        output: [],
        error: "Execução cancelada antes de iniciar o Worker.",
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    }

    if (typeof Worker === "undefined") {
      return {
        status: "error",
        wasExecuted: false,
        staticRejected: false,
        unavailableInEnvironment: true,
        workerTerminated: false,
        timedOut: false,
        cancelled: false,
        truncated: false,
        output: [],
        error: "Execução restrita de JavaScript requer Web Worker no navegador (indisponível no servidor).",
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    }

    if (activeWorkerCount >= MAX_CONCURRENT_JS_WORKERS) {
      return {
        status: "error",
        wasExecuted: false,
        staticRejected: false,
        unavailableInEnvironment: false,
        workerTerminated: false,
        timedOut: false,
        cancelled: false,
        truncated: false,
        output: [],
        error: "Limite de execuções JavaScript concorrentes atingido. Aguarde a conclusão da execução atual.",
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    }

    activeWorkerCount += 1;

    return new Promise<RestrictedJsExecutionResult>((resolve) => {
      let worker: Worker | null = null;
      let blobUrl: string | null = null;
      let settled = false;
      let startedExecution = false;
      let messageCount = 0;
      let execTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (payload: Omit<RestrictedJsExecutionResult, "durationMs" | "createdAt">) => {
        if (settled) return;
        settled = true;
        clearTimeout(bootstrapTimer);
        if (execTimer) clearTimeout(execTimer);
        if (options.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }
        let terminated = false;
        if (worker) {
          try {
            worker.terminate();
            terminated = true;
          } catch {}
          worker = null;
        }
        if (blobUrl) {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {}
          blobUrl = null;
        }
        activeWorkerCount = Math.max(0, activeWorkerCount - 1);
        resolve({
          ...payload,
          workerTerminated: payload.workerTerminated || terminated,
          durationMs: Math.round(performance.now() - started),
          createdAt: new Date().toISOString(),
        });
      };

      const onAbort = () => {
        finish({
          status: "error",
          wasExecuted: startedExecution,
          staticRejected: false,
          unavailableInEnvironment: false,
          workerTerminated: true,
          timedOut: false,
          cancelled: true,
          truncated: false,
          output: [],
          error: "Execução interrompida por cancelamento ou troca de sessão.",
        });
      };

      // Timeout separado para bootstrap do script do Worker (evita falso timeout em cold-compile do dev server)
      const bootstrapTimer = globalThis.setTimeout(() => {
        finish({
          status: "error",
          wasExecuted: false,
          staticRejected: false,
          unavailableInEnvironment: false,
          workerTerminated: true,
          timedOut: true,
          cancelled: false,
          truncated: false,
          output: [],
          error: "Tempo limite excedido ao inicializar o Worker isolado.",
        });
      }, 10_000);

      if (options.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        if (canUseHttpWorkerEndpoint()) {
          worker = new Worker(JS_WORKER_ENDPOINT);
        } else {
          blobUrl = URL.createObjectURL(
            new Blob([buildHardenedWorkerBootstrapScript()], { type: "text/javascript" }),
          );
          worker = new Worker(blobUrl);
        }
      } catch (err) {
        finish({
          status: "error",
          wasExecuted: false,
          staticRejected: false,
          unavailableInEnvironment: true,
          workerTerminated: false,
          timedOut: false,
          cancelled: false,
          truncated: false,
          output: [],
          error: sanitizeExecutionError(err),
        });
        return;
      }

      worker.onmessage = (
        event: MessageEvent<{
          __workerReady?: boolean;
          ok?: boolean;
          output?: unknown;
          truncated?: boolean;
          error?: unknown;
        }>,
      ) => {
        const data = event.data && typeof event.data === "object" ? event.data : {};
        if (!startedExecution && data.__workerReady === true) {
          startedExecution = true;
          clearTimeout(bootstrapTimer);
          execTimer = globalThis.setTimeout(() => {
            finish({
              status: "error",
              wasExecuted: true,
              staticRejected: false,
              unavailableInEnvironment: false,
              workerTerminated: true,
              timedOut: true,
              cancelled: false,
              truncated: false,
              output: [],
              error: `Execução interrompida após ${Math.round(timeoutMs / 1000)} segundos.`,
            });
          }, timeoutMs);
          worker?.postMessage({
            code,
            maxOutputLines,
            maxLineChars,
            maxOutputBytes,
          });
          return;
        }
        messageCount += 1;
        // Aceita estritamente 1 mensagem de resultado; qualquer mensagem extra/tardia é descartada e o Worker encerrado.
        if (settled || messageCount > 1) {
          try {
            worker?.terminate();
          } catch {}
          return;
        }
        const clamped = clampHostOutput(data.output, maxOutputLines, maxLineChars, maxOutputBytes);
        const truncated = Boolean(data.truncated) || clamped.truncated;
        finish({
          status: data.ok === true ? "success" : "error",
          wasExecuted: true,
          staticRejected: false,
          unavailableInEnvironment: false,
          workerTerminated: true,
          timedOut: false,
          cancelled: false,
          truncated,
          output: clamped.lines,
          error: data.ok === true ? undefined : sanitizeExecutionError(data.error),
        });
      };

      worker.onerror = (event) => {
        finish({
          status: "error",
          wasExecuted: startedExecution,
          staticRejected: false,
          unavailableInEnvironment: false,
          workerTerminated: true,
          timedOut: false,
          cancelled: false,
          truncated: false,
          output: [],
          error: sanitizeExecutionError(event.message || "Erro de execução no Worker."),
        });
      };
    });
  },

  async run(language: LabLanguage, code: string, timeoutMs = DEFAULT_JS_TIMEOUT_MS): Promise<LabExecutionResult> {
    const started = performance.now();
    const invalid = validateExecutableCode(language, code);
    if (invalid) return result("error", started, [], invalid);
    if (language === "math") return MathLabService.execute(code);
    if (language === "data") return DataLabService.execute(code);
    if (language === "typescript") {
      return result(
        "unsupported",
        started,
        [],
        "TypeScript possui editor e preview, mas a execução requer compilação e está desativada nesta versão. Use JavaScript ou Matemática para execução direta.",
      );
    }
    if (language === "python") {
      return result(
        "unsupported",
        started,
        [],
        "Python está preparado no contrato do Lab, mas não executa código nesta versão. Use JavaScript, SQL, Matemática ou Dados para execução local.",
      );
    }
    if (language !== "javascript") {
      return result("unsupported", started, [], "Use o preview ou o executor específico deste modo.");
    }

    const jsRes = await this.runRestrictedJavaScript(code, { timeoutMs });
    return {
      status: jsRes.status,
      output: [...jsRes.output],
      error: jsRes.error,
      durationMs: jsRes.durationMs,
      createdAt: jsRes.createdAt,
    };
  },
};
