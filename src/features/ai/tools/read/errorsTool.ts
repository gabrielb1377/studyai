/**
 * StudyAI — Tool Engine (TE-3)
 * Ferramenta de leitura `errors@0.1.0` (classe `read`, execução local no cliente).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §4 e §7:
 * - Reutiliza `ErrorNotebookStorage` (`ErrorNotebookEntry`) e `MemoryRetrievalEngine.selectForTutor`.
 * - Respeita integralmente `memoryState.settings.enabled` (quando desativada, não retorna memórias).
 * - Restrita à conta ativa via `SessionOperationManager`; nunca resolve erros nem altera memórias.
 */

import { MemoryRetrievalEngine } from "@/features/learning/memory/MemoryRetrievalEngine";
import type { ToolRegistryImpl } from "../ToolRegistry";
import type { ToolExecutorFn, ToolSpec } from "../types";
import {
  filterOwnedRecords,
  getToolAccountReadProvider,
  runWithVerifiedAccountSession,
} from "./AccountReadProvider";

export const ERRORS_MAX_ITEMS = 5;
export const MEMORIES_MAX_ITEMS = 5;

export interface ErrorToolItem {
  readonly errorId: string;
  readonly studyId?: string;
  readonly topic: string;
  readonly questionPrompt: string;
  readonly occurrences: number;
  readonly status: "pending" | "reviewed" | "resolved";
}

export interface MemoryToolItem {
  readonly category: string;
  readonly title: string;
  readonly content: string;
}

export interface ErrorsToolOutput extends Record<string, unknown> {
  readonly status: "ok" | "empty";
  readonly memoryEnabled: boolean;
  readonly errors: readonly ErrorToolItem[];
  readonly memories: readonly MemoryToolItem[];
  readonly note: string;
}

export const executeErrorsTool: ToolExecutorFn = async (args, context): Promise<ErrorsToolOutput> => {
  const studyId = typeof args.studyId === "string" ? args.studyId.trim() : undefined;
  const query = typeof args.query === "string" ? args.query.trim() : undefined;
  const includeMemory = args.includeMemory !== false;
  const requestedLimit = typeof args.limit === "number" ? Math.floor(args.limit) : ERRORS_MAX_ITEMS;
  const limit = Math.max(1, Math.min(ERRORS_MAX_ITEMS, requestedLimit));

  return runWithVerifiedAccountSession(context.userId, async (operation) => {
    const provider = getToolAccountReadProvider();
    const dataset = await provider.loadErrorsAndMemory(operation.userId, operation.signal);
    operation.assertCurrent();

    // Filtra estritamente registros com proprietário comprovado === conta ativa
    let ownedErrors = filterOwnedRecords(dataset.errors, operation.userId).filter(
      (entry) => entry.status !== "resolved" && !entry.sourceUnavailable,
    );
    if (studyId) {
      ownedErrors = ownedErrors.filter((entry) => entry.studyId === studyId);
    }

    const sortedErrors = [...ownedErrors]
      .sort(
        (a, b) =>
          b.occurrences - a.occurrences ||
          b.lastOccurredAt.localeCompare(a.lastOccurredAt) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit);

    const errorItems: ErrorToolItem[] = sortedErrors.map((e) => ({
      errorId: e.id,
      ...(e.studyId ? { studyId: e.studyId } : {}),
      topic: e.topic.slice(0, 120),
      questionPrompt: e.questionPrompt.slice(0, 260),
      occurrences: e.occurrences,
      status: e.status,
    }));

    // Memória respeita propriedade da conta E preferência de privacidade `settings.enabled`
    const ownedMemoryState =
      dataset.memoryState && dataset.memoryState.ownerId === operation.userId
        ? dataset.memoryState
        : null;
    const memoryEnabled = Boolean(ownedMemoryState?.settings.enabled);

    let memoryItems: MemoryToolItem[] = [];
    if (includeMemory && ownedMemoryState && memoryEnabled) {
      const selected = MemoryRetrievalEngine.selectForTutor({
        state: ownedMemoryState,
        errorEntries: ownedErrors,
        studyId,
        query,
      });
      if (selected?.items) {
        memoryItems = selected.items.slice(0, MEMORIES_MAX_ITEMS).map((m) => ({
          category: m.category,
          title: m.title.slice(0, 120),
          content: m.content.slice(0, 260),
        }));
      }
    }

    const hasAny = errorItems.length > 0 || memoryItems.length > 0;
    return {
      status: hasAny ? "ok" : "empty",
      memoryEnabled,
      errors: errorItems,
      memories: memoryItems,
      note: hasAny
        ? `Recuperados ${errorItems.length} erro(s) e ${memoryItems.length} memória(s) autorizada(s) sem alterações persistentes.`
        : "Nenhum erro pendente ou memória ativa encontrada para esta conta/filtro.",
    };
  });
};

export const errorsToolSpec: ToolSpec = {
  id: "errors",
  version: "0.1.0",
  class: "read",
  description:
    "Consulta erros pendentes do caderno de erros e memórias pedagógicas ativas da conta atual respeitando privacidade e limites.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      studyId: { type: "string", minLength: 1, maxLength: 120 },
      query: { type: "string", minLength: 1, maxLength: 200 },
      includeMemory: { type: "boolean" },
      limit: { type: "number", min: 1, max: ERRORS_MAX_ITEMS },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["status", "memoryEnabled", "errors", "memories", "note"],
    properties: {
      status: { type: "string", enum: ["ok", "empty"] },
      memoryEnabled: { type: "boolean" },
      errors: {
        type: "array",
        maxItems: ERRORS_MAX_ITEMS,
        items: {
          type: "object",
          required: ["errorId", "topic", "questionPrompt", "occurrences", "status"],
          properties: {
            errorId: { type: "string", maxLength: 160 },
            studyId: { type: "string", maxLength: 160 },
            topic: { type: "string", maxLength: 120 },
            questionPrompt: { type: "string", maxLength: 260 },
            occurrences: { type: "number", min: 1 },
            status: { type: "string", enum: ["pending", "reviewed", "resolved"] },
          },
        },
      },
      memories: {
        type: "array",
        maxItems: MEMORIES_MAX_ITEMS,
        items: {
          type: "object",
          required: ["category", "title", "content"],
          properties: {
            category: { type: "string", maxLength: 60 },
            title: { type: "string", maxLength: 120 },
            content: { type: "string", maxLength: 260 },
          },
        },
      },
      note: { type: "string", maxLength: 400 },
    },
  },
  scope: {
    requiredScopes: ["account", "errors"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 2_000,
    maxInputBytes: 1_024,
    maxOutputBytes: 6_144,
    maxItems: ERRORS_MAX_ITEMS,
    maxDepth: 5,
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
    description: "Paridade com ErrorNotebook/MemoryRetrievalEngine, privacidade e isolamento A→B.",
  },
  available: true,
};

export function registerErrorsTool(registry: ToolRegistryImpl): void {
  if (!registry.has(errorsToolSpec.id)) {
    registry.register(errorsToolSpec, executeErrorsTool);
  }
}
