/**
 * StudyAI — Tool Engine (TE-4)
 * Ferramenta canônica de leitura documental por página (`doc_reader@0.1.0`).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §3–§5:
 * - Classe oficial: `read` (`requiresConfirmation: false` — leitura pura, sem mutação).
 * - Reutiliza `ContentStorage` / `ExtractedContent` / `ExtractedPage` existentes.
 * - Valida proprietário, identificador autorizado, página existente, limites de páginas/bytes
 *   e identidade da sessão ANTES e DEPOIS da leitura assíncrona.
 * - Diferencia explicitamente: `ready`, `page_not_found`, `material_unavailable` e `content_not_extracted`.
 * - Nunca inventa conteúdo, OCR ou paginação; nunca acessa URLs ou caminhos arbitrários.
 */

import { filterOwnedRecords } from "../read/AccountReadProvider";
import type { ToolExecutorFn, ToolSpec } from "../types";
import {
  getToolAccountTransformProvider,
  runWithVerifiedAccountSession,
} from "./AccountTransformProvider";

export const DOC_READER_MAX_PAGES_PER_CALL = 3;
export const DOC_READER_MAX_CHARS_PER_PAGE = 2400;

const UNSAFE_IDENTIFIER_PATTERN = /(?:^https?:\/\/|^file:\/\/|\.\.|[\\/]|[\u0000-\u001f])/i;

export interface DocReaderPageExcerpt {
  readonly page: number;
  readonly method: "native" | "ocr" | "none";
  readonly status: "ready" | "review" | "error";
  readonly text: string;
  readonly truncated: boolean;
  readonly reference: string;
}

export interface DocReaderToolOutput {
  readonly documentStatus:
    | "ready"
    | "page_not_found"
    | "material_unavailable"
    | "content_not_extracted";
  readonly materialId: string;
  readonly studyId?: string;
  readonly title?: string;
  readonly totalPages: number;
  readonly paginationSource: "pages" | "single_stream" | "none";
  readonly pages: readonly DocReaderPageExcerpt[];
  readonly notice?: string;
}

function truncatePageText(text: string): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= DOC_READER_MAX_CHARS_PER_PAGE) {
    return { text: normalized, truncated: false };
  }
  return {
    text: `${normalized.slice(0, DOC_READER_MAX_CHARS_PER_PAGE - 3).trimEnd()}...`,
    truncated: true,
  };
}

function isSafeMaterialIdentifier(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 && !UNSAFE_IDENTIFIER_PATTERN.test(trimmed);
}

export const docReaderToolSpec: ToolSpec = {
  id: "doc_reader",
  version: "0.1.0",
  class: "read",
  description:
    "Lê trechos extraídos por página de um documento autorizado da conta ativa, sem acessar URLs ou arquivos arbitrários e sem inventar OCR ou numeração.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["materialId", "page"],
    properties: {
      materialId: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        description: "Identificador autorizado do material (fileId ou contentId) na conta ativa.",
      },
      studyId: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        description: "Opcional: restringe a leitura ao estudo especificado.",
      },
      page: {
        type: "number",
        min: 1,
        max: 10000,
        description: "Número inteiro da página inicial (base 1).",
      },
      endPage: {
        type: "number",
        min: 1,
        max: 10000,
        description: "Opcional: página final inclusiva (máximo de 3 páginas por chamada).",
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["documentStatus", "materialId", "totalPages", "paginationSource", "pages"],
    properties: {
      documentStatus: {
        type: "string",
        enum: ["ready", "page_not_found", "material_unavailable", "content_not_extracted"],
      },
      materialId: { type: "string", maxLength: 128 },
      studyId: { type: "string", maxLength: 128 },
      title: { type: "string", maxLength: 240 },
      totalPages: { type: "number", min: 0, max: 10000 },
      paginationSource: { type: "string", enum: ["pages", "single_stream", "none"] },
      pages: {
        type: "array",
        maxItems: DOC_READER_MAX_PAGES_PER_CALL,
        items: {
          type: "object",
          required: ["page", "method", "status", "text", "truncated", "reference"],
          properties: {
            page: { type: "number", min: 1, max: 10000 },
            method: { type: "string", enum: ["native", "ocr", "none"] },
            status: { type: "string", enum: ["ready", "review", "error"] },
            text: { type: "string", maxLength: DOC_READER_MAX_CHARS_PER_PAGE },
            truncated: { type: "boolean" },
            reference: { type: "string", maxLength: 260 },
          },
        },
      },
      notice: { type: "string", maxLength: 320 },
    },
  },
  scope: {
    requiredScopes: ["account", "study"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 2500,
    maxInputBytes: 2048,
    maxOutputBytes: 12288,
    maxItems: DOC_READER_MAX_PAGES_PER_CALL,
    maxDepth: 6,
    maxCallsPerTurn: 3,
  },
  requiresConfirmation: false,
  audit: {
    recordDuration: true,
    includeStudentContent: false,
    allowedMetadataFields: ["toolId", "toolVersion", "toolClass", "status", "denialReason", "durationMs"],
  },
  tests: {
    deterministicFixtures: true,
    description: "Valida isolamento A->B, distinção de estados documentais e bloqueio de URLs/path traversal.",
  },
  available: true,
};

export const executeDocReaderTool: ToolExecutorFn = async (args, context) => {
  const materialId = typeof args.materialId === "string" ? args.materialId.trim() : "";
  const studyIdFilter = typeof args.studyId === "string" ? args.studyId.trim() : undefined;
  const startPage = typeof args.page === "number" ? args.page : NaN;
  const endPage = typeof args.endPage === "number" ? args.endPage : startPage;

  if (!isSafeMaterialIdentifier(materialId)) {
    throw new Error("Identificador de material inválido ou inseguro.");
  }
  if (studyIdFilter !== undefined && !isSafeMaterialIdentifier(studyIdFilter)) {
    throw new Error("Identificador de estudo inválido ou inseguro.");
  }
  if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || endPage < startPage) {
    throw new Error("Intervalo de páginas inválido.");
  }
  if (endPage - startPage + 1 > DOC_READER_MAX_PAGES_PER_CALL) {
    throw new Error(`Máximo de ${DOC_READER_MAX_PAGES_PER_CALL} páginas por leitura.`);
  }

  return runWithVerifiedAccountSession(context.userId, async (operation) => {
    const provider = getToolAccountTransformProvider();
    const dataset = await provider.loadDocuments(context.userId, operation.signal);
    operation.assertCurrent();

    const ownedDocs = filterOwnedRecords(dataset.contents, context.userId);
    const doc = ownedDocs.find(
      (item) =>
        (item.fileId === materialId || item.id === materialId) &&
        (!studyIdFilter || item.studyId === studyIdFilter),
    );

    if (!doc) {
      return {
        documentStatus: "material_unavailable",
        materialId,
        totalPages: 0,
        paginationSource: "none",
        pages: [],
        notice: "Material não encontrado ou indisponível na conta ativa.",
      } satisfies DocReaderToolOutput as unknown as Record<string, unknown>;
    }

    const title = (doc.metadata.title || doc.metadata.name || doc.fileId).slice(0, 240);

    if (doc.status !== "extracted") {
      return {
        documentStatus: "content_not_extracted",
        materialId: doc.fileId,
        studyId: doc.studyId,
        title,
        totalPages: doc.pages?.length ?? doc.metadata.pageCount ?? 0,
        paginationSource: doc.pages?.length ? "pages" : "none",
        pages: [],
        notice:
          doc.status === "processing"
            ? "A extração do documento ainda está em andamento."
            : "O documento não possui texto extraído disponível para leitura.",
      } satisfies DocReaderToolOutput as unknown as Record<string, unknown>;
    }

    // Caso 1: Documento possui páginas extraídas estruturadas (`ExtractedPage[]`)
    if (Array.isArray(doc.pages) && doc.pages.length > 0) {
      const sortedPages = [...doc.pages].sort((a, b) => a.page - b.page);
      const totalPages = Math.max(
        sortedPages[sortedPages.length - 1]?.page ?? 0,
        doc.metadata.pageCount ?? 0,
      );
      const matched = sortedPages.filter((p) => p.page >= startPage && p.page <= endPage);

      if (matched.length === 0) {
        return {
          documentStatus: "page_not_found",
          materialId: doc.fileId,
          studyId: doc.studyId,
          title,
          totalPages,
          paginationSource: "pages",
          pages: [],
          notice: `Página solicitada (${startPage}${endPage > startPage ? `–${endPage}` : ""}) inexistente no documento extraído.`,
        } satisfies DocReaderToolOutput as unknown as Record<string, unknown>;
      }

      const excerpts: DocReaderPageExcerpt[] = matched.slice(0, DOC_READER_MAX_PAGES_PER_CALL).map((p) => {
        const clipped = truncatePageText(p.text);
        return {
          page: p.page,
          method: p.method,
          status: p.status,
          text: clipped.text,
          truncated: clipped.truncated,
          reference: `${title} · fileId=${doc.fileId} · p. ${p.page}`.slice(0, 260),
        };
      });

      const hasAnyText = excerpts.some((e) => e.text.length > 0);
      if (!hasAnyText) {
        return {
          documentStatus: "content_not_extracted",
          materialId: doc.fileId,
          studyId: doc.studyId,
          title,
          totalPages,
          paginationSource: "pages",
          pages: [],
          notice: "As páginas solicitadas não possuem texto extraído (nenhum OCR foi inventado).",
        } satisfies DocReaderToolOutput as unknown as Record<string, unknown>;
      }

      return {
        documentStatus: "ready",
        materialId: doc.fileId,
        studyId: doc.studyId,
        title,
        totalPages,
        paginationSource: "pages",
        pages: excerpts,
      } satisfies DocReaderToolOutput as unknown as Record<string, unknown>;
    }

    // Caso 2: Documento extraído em fluxo único (sem array `pages`) — nunca inventa página >= 2
    const trimmedText = doc.extractedText.trim();
    if (!trimmedText) {
      return {
        documentStatus: "content_not_extracted",
        materialId: doc.fileId,
        studyId: doc.studyId,
        title,
        totalPages: 0,
        paginationSource: "none",
        pages: [],
        notice: "O documento não possui texto extraído disponível.",
      } satisfies DocReaderToolOutput as unknown as Record<string, unknown>;
    }

    if (startPage !== 1 || endPage !== 1) {
      return {
        documentStatus: "page_not_found",
        materialId: doc.fileId,
        studyId: doc.studyId,
        title,
        totalPages: 1,
        paginationSource: "single_stream",
        pages: [],
        notice: "Material extraído sem paginação multipágina; apenas a página 1 existe.",
      } satisfies DocReaderToolOutput as unknown as Record<string, unknown>;
    }

    const clipped = truncatePageText(trimmedText);
    return {
      documentStatus: "ready",
      materialId: doc.fileId,
      studyId: doc.studyId,
      title,
      totalPages: 1,
      paginationSource: "single_stream",
      pages: [
        {
          page: 1,
          method: doc.metadata.ocrPerformed ? "ocr" : "native",
          status: "ready",
          text: clipped.text,
          truncated: clipped.truncated,
          reference: `${title} · fileId=${doc.fileId} · p. 1`.slice(0, 260),
        },
      ],
    } satisfies DocReaderToolOutput as unknown as Record<string, unknown>;
  });
};
