/**
 * StudyAI — Tool Engine (TE-3)
 * Ferramenta de leitura `library@0.1.0` (classe `read`, execução local no cliente).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §4 e §7:
 * - Reutiliza `SearchService.search` e `RankingService.rank` (sem novo RAG/OCR/embeddings).
 * - Restrita estritamente à conta ativa validada pelo `SessionOperationManager`.
 * - Retorna somente trechos curtos deduplicados (nunca documentos completos), com limites de itens e bytes.
 */

import { RankingService } from "@/features/retrieval/RankingService";
import { SearchService } from "@/features/retrieval/SearchService";
import type { ToolRegistryImpl } from "../ToolRegistry";
import type { ToolExecutorFn, ToolSpec } from "../types";
import {
  filterOwnedRecords,
  getToolAccountReadProvider,
  runWithVerifiedAccountSession,
} from "./AccountReadProvider";

export const LIBRARY_MAX_ITEMS = 5;
export const LIBRARY_MAX_EXCERPT_CHARS = 450;

export interface LibraryToolItem {
  readonly chunkId: string;
  readonly studyId: string;
  readonly materialId: string;
  readonly sourceName: string;
  readonly pageStart?: number;
  readonly score: number;
  readonly excerpt: string;
}

export interface LibraryToolOutput extends Record<string, unknown> {
  readonly status: "ok" | "empty";
  readonly totalMatched: number;
  readonly items: readonly LibraryToolItem[];
  readonly note: string;
}

function truncateExcerpt(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= LIBRARY_MAX_EXCERPT_CHARS) return compact;
  return `${compact.slice(0, LIBRARY_MAX_EXCERPT_CHARS - 3)}...`;
}

export const executeLibraryTool: ToolExecutorFn = async (args, context): Promise<LibraryToolOutput> => {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const studyId = typeof args.studyId === "string" ? args.studyId.trim() : undefined;
  const materialId = typeof args.materialId === "string" ? args.materialId.trim() : undefined;
  const requestedLimit = typeof args.limit === "number" ? Math.floor(args.limit) : LIBRARY_MAX_ITEMS;
  const limit = Math.max(1, Math.min(LIBRARY_MAX_ITEMS, requestedLimit));

  return runWithVerifiedAccountSession(context.userId, async (operation) => {
    const provider = getToolAccountReadProvider();
    const dataset = await provider.loadLibrary(operation.userId, operation.signal);
    operation.assertCurrent();

    // Filtra estritamente pela conta ativa (descarta registros de outras contas ou sem proprietário)
    let ownedChunks = filterOwnedRecords(dataset.chunks, operation.userId);
    if (studyId) {
      ownedChunks = ownedChunks.filter((c) => c.studyId === studyId);
    }
    if (materialId) {
      ownedChunks = ownedChunks.filter((c) => c.fileId === materialId);
    }

    if (ownedChunks.length === 0 || !query) {
      return {
        status: "empty",
        totalMatched: 0,
        items: [],
        note: "Nenhum trecho autorizado encontrado na biblioteca da conta ativa para os filtros informados.",
      };
    }

    // Reutiliza SearchService + RankingService existentes
    const lexical = SearchService.search(query, ownedChunks, {
      studyId,
      limit: limit * 3,
    });
    const ranked = RankingService.rank(query, ownedChunks, [], lexical, {
      studyId,
      limit: limit * 2,
    });

    // Deduplicação por (fileId, chunkIndex) e ordenação determinística
    const seen = new Set<string>();
    const deduped = ranked
      .filter((chunk) => {
        const key = `${chunk.fileId}:${chunk.chunkIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.fileId.localeCompare(b.fileId) ||
          a.chunkIndex - b.chunkIndex,
      )
      .slice(0, limit);

    if (deduped.length === 0) {
      return {
        status: "empty",
        totalMatched: 0,
        items: [],
        note: "Nenhum trecho relevante encontrado nos materiais autorizados desta conta.",
      };
    }

    const items: LibraryToolItem[] = deduped.map((chunk) => ({
      chunkId: chunk.id,
      studyId: chunk.studyId,
      materialId: chunk.fileId,
      sourceName: chunk.metadata.sourceName,
      ...(chunk.metadata.pageStart !== undefined ? { pageStart: chunk.metadata.pageStart } : {}),
      score: chunk.score,
      excerpt: truncateExcerpt(chunk.text),
    }));

    return {
      status: "ok",
      totalMatched: items.length,
      items,
      note: `Recuperados ${items.length} trecho(s) da biblioteca autorizada da conta ativa.`,
    };
  });
};

export const libraryToolSpec: ToolSpec = {
  id: "library",
  version: "0.1.0",
  class: "read",
  description:
    "Consulta trechos relevantes dos materiais autorizados da conta ativa reutilizando SearchService e RankingService.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1, maxLength: 300 },
      studyId: { type: "string", minLength: 1, maxLength: 120 },
      materialId: { type: "string", minLength: 1, maxLength: 120 },
      limit: { type: "number", min: 1, max: LIBRARY_MAX_ITEMS },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["status", "totalMatched", "items", "note"],
    properties: {
      status: { type: "string", enum: ["ok", "empty"] },
      totalMatched: { type: "number", min: 0, max: LIBRARY_MAX_ITEMS },
      items: {
        type: "array",
        maxItems: LIBRARY_MAX_ITEMS,
        items: {
          type: "object",
          required: ["chunkId", "studyId", "materialId", "sourceName", "score", "excerpt"],
          properties: {
            chunkId: { type: "string", maxLength: 160 },
            studyId: { type: "string", maxLength: 160 },
            materialId: { type: "string", maxLength: 160 },
            sourceName: { type: "string", maxLength: 240 },
            pageStart: { type: "number", min: 0 },
            score: { type: "number" },
            excerpt: { type: "string", maxLength: LIBRARY_MAX_EXCERPT_CHARS },
          },
        },
      },
      note: { type: "string", maxLength: 400 },
    },
  },
  scope: {
    requiredScopes: ["account", "library"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 2_000,
    maxInputBytes: 2_048,
    maxOutputBytes: 6_144,
    maxItems: LIBRARY_MAX_ITEMS,
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
    description: "Paridade com SearchService/RankingService e isolamento A→B.",
  },
  available: true,
};

export function registerLibraryTool(registry: ToolRegistryImpl): void {
  if (!registry.has(libraryToolSpec.id)) {
    registry.register(libraryToolSpec, executeLibraryTool);
  }
}
