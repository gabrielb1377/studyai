import type {
  ExtractedContent,
  ExtractedPage,
  ExtractedTable,
  OcrMode,
  OcrPipelineInfo,
} from "../extraction/ExtractionTypes";
import { ContentStorage } from "../extraction/ContentStorage";
import { createIngestionLog, updateIngestionStage } from "../extraction/IngestionState";
import { DocumentOcrEngine, type OcrProcessResult } from "./engine";
import { ReindexService, type ReindexResult } from "./ReindexService";
import { buildPipelineInfo, pagesFromSections, pagesMetadata, pagesToText, restructurePageText, sectionsFromPages } from "./structure";
import { replaceTableInText, tableToMarkdown, updateTableCell } from "./tables";

export type TableCellUpdate = { tableId: string; row: number; column: number; value: string };

export type PageUpdate = {
  text?: string;
  cells?: TableCellUpdate[];
  tableRows?: { tableId: string; rows: string[][] }[];
};

export type SavePageResult = {
  content: ExtractedContent;
  page: ExtractedPage;
  reindex: ReindexResult;
};

export type ReprocessInput = {
  content: ExtractedContent;
  file: File;
  pages?: readonly number[];
  mode?: OcrMode;
  overwriteCorrections?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: { progress: number; page?: number; pages?: number; message?: string }) => void;
};

export type ReprocessResult = {
  content: ExtractedContent;
  result: OcrProcessResult;
  reindex: ReindexResult;
  preservedEdits: number;
};

function nowIso() {
  return new Date().toISOString();
}

function ensurePages(content: ExtractedContent): ExtractedPage[] {
  if (content.pages?.length) return content.pages.map((page) => ({ ...page, tables: [...page.tables] }));
  return pagesFromSections(content.sections ?? [], { slideMode: content.fileType === "pptx" });
}

function restructure(page: ExtractedPage, text: string, tableIds: readonly string[]) {
  const structured = restructurePageText(text, page.page, page.method === "ocr" ? "ocr" : "text");
  return {
    ...structured,
    tables: structured.tables.map((table, index) => ({
      ...table,
      id: tableIds[index] ?? table.id,
    })),
  };
}

function statusFor(page: ExtractedPage, text: string, edited: boolean) {
  if (!text.trim()) return "review" as const;
  if (edited) return "ready" as const;
  return page.status;
}

function tableFromRows(table: ExtractedTable, rows: readonly string[][]): ExtractedTable {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  return {
    ...table,
    rows: rows.map((row) => [...row]),
    columns,
    complete: rows.every((row) => row.length === columns),
    markdown: tableToMarkdown(rows),
    warnings: [],
  };
}

async function persist(content: ExtractedContent) {
  const reindex = await ReindexService.rebuild(content);
  return reindex;
}

export const ExtractionReviewService = {
  async findRecord(fileId: string) {
    const store = await ContentStorage.load();
    return store.records.find((record) => record.fileId === fileId) ?? null;
  },

  async preparePages(fileId: string): Promise<SavePageResult> {
    const record = await this.findRecord(fileId);
    if (!record) throw new Error("O conteúdo extraído deste material não foi encontrado.");
    const pages = ensurePages(record);
    if (pages.length === 0) throw new Error("Não há texto extraído para estruturar em páginas.");
    return this.commit(record, pages, pages[0].page);
  },

  async savePage(fileId: string, pageNumber: number, update: PageUpdate): Promise<SavePageResult> {
    const record = await this.findRecord(fileId);
    if (!record) throw new Error("O conteúdo extraído deste material não foi encontrado.");
    const pages = ensurePages(record);
    const index = pages.findIndex((page) => page.page === pageNumber);
    if (index < 0) throw new Error("A página selecionada não existe neste documento.");
    const page = pages[index];

    let text = update.text ?? page.text;
    let tables = [...page.tables];

    for (const change of update.cells ?? []) {
      const current = tables.find((table) => table.id === change.tableId);
      if (!current) continue;
      const updated = updateTableCell(current, change.row, change.column, change.value);
      text = replaceTableInText(text, current.markdown, updated.markdown);
      tables = tables.map((table) => table.id === updated.id ? updated : table);
    }

    for (const change of update.tableRows ?? []) {
      const current = tables.find((table) => table.id === change.tableId);
      if (!current) continue;
      const updated = tableFromRows(current, change.rows);
      text = replaceTableInText(text, current.markdown, updated.markdown);
      tables = tables.map((table) => table.id === updated.id ? updated : table);
    }

    const structured = restructure(page, text, page.tables.map((table) => table.id));
    const edited = structured.text !== page.originalText || page.edited;
    const nextPage: ExtractedPage = {
      ...page,
      text: structured.text,
      tables: structured.tables,
      edited,
      editedAt: edited ? nowIso() : undefined,
      status: statusFor(page, structured.text, edited),
      warnings: page.warnings.filter((warning) => !warning.startsWith("Tabela com estrutura irregular")),
    };

    return this.commit(record, pages.map((current, currentIndex) => currentIndex === index ? nextPage : current), pageNumber);
  },

  async restorePage(fileId: string, pageNumber: number): Promise<SavePageResult> {
    const record = await this.findRecord(fileId);
    if (!record) throw new Error("O conteúdo extraído deste material não foi encontrado.");
    const pages = ensurePages(record);
    const index = pages.findIndex((page) => page.page === pageNumber);
    if (index < 0) throw new Error("A página selecionada não existe neste documento.");
    const page = pages[index];
    const structured = restructure(page, page.originalText, page.tables.map((table) => table.id));
    const restored: ExtractedPage = {
      ...page,
      text: structured.text,
      tables: structured.tables,
      edited: false,
      editedAt: undefined,
      status: page.quality.level === "poor" ? "review" : "ready",
    };
    return this.commit(record, pages.map((current, currentIndex) => currentIndex === index ? restored : current), pageNumber);
  },

  async reprocess(input: ReprocessInput): Promise<ReprocessResult> {
    const { content } = input;
    if (content.fileType !== "pdf" && !["png", "jpg", "jpeg", "webp"].includes(content.fileType)) {
      throw new Error("O reprocessamento assistido está disponível para PDFs e imagens.");
    }
    const mode = input.mode ?? "auto";
    const existingPages = ensurePages(content);
    const selection = input.pages?.length
      ? new Set(input.pages)
      : new Set(existingPages.map((page) => page.page));

    const result = content.fileType === "pdf"
      ? await DocumentOcrEngine.processPdf(input.file, { mode, pages: [...selection], signal: input.signal, onProgress: input.onProgress })
      : await DocumentOcrEngine.processImage(input.file, { mode, signal: input.signal, onProgress: input.onProgress });

    let preservedEdits = 0;
    const merged = existingPages.map((existing) => {
      if (!selection.has(existing.page)) return existing;
      const replacement = result.pages.find((page) => page.page === existing.page);
      if (!replacement) return existing;
      if (existing.edited && !input.overwriteCorrections) {
        preservedEdits += 1;
        return existing;
      }
      return replacement;
    });
    for (const page of result.pages) {
      if (!merged.some((existing) => existing.page === page.page)) merged.push(page);
    }
    merged.sort((left, right) => left.page - right.page);

    const warnings = [
      ...(content.pipeline?.warnings ?? []),
      ...result.pipeline.warnings,
      ...(preservedEdits > 0 ? [`${preservedEdits} página(s) com correção manual foram preservadas.`] : []),
    ];
    const pipeline: OcrPipelineInfo = buildPipelineInfo({
      pages: merged,
      mode,
      engine: result.pipeline.engine,
      createdAt: content.pipeline?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      cancelled: result.cancelled,
      warnings,
      durationMs: (content.pipeline?.durationMs ?? 0) + (result.pipeline.durationMs ?? 0),
    });

    const stageMessage = result.cancelled
      ? `Reprocessamento cancelado. ${pipeline.ocrPages} página(s) com OCR.`
      : `${pipeline.ocrPages} página(s) com OCR · ${pipeline.nativePages} página(s) com texto nativo · ${preservedEdits} correção(ões) preservada(s).`;
    const nextContent: ExtractedContent = {
      ...content,
      pages: merged,
      pipeline,
      extractedText: pagesToText(merged),
      sections: sectionsFromPages(merged, {
        slideMode: content.fileType === "pptx",
        fallbackTitle: content.metadata.title,
      }),
      metadata: {
        ...content.metadata,
        ...pagesMetadata(merged, pipeline),
        ...(merged.length > 0 ? { pageCount: merged.length } : {}),
        processingTimeMs: content.metadata.processingTimeMs,
      },
      stages: updateIngestionStage(
        content.stages ?? [],
        "ocr",
        pipeline.ocrPages > 0 ? "completed" : "skipped",
        stageMessage,
      ),
      logs: [...(content.logs ?? []), createIngestionLog("ocr", result.cancelled ? "skipped" : "completed", stageMessage)],
      status: "extracted",
      error: undefined,
      errorDetails: undefined,
    };

    const reindex = await persist(nextContent);
    return { content: reindex.content, result, reindex, preservedEdits };
  },

  async commit(record: ExtractedContent, pages: ExtractedPage[], focusPage: number): Promise<SavePageResult> {
    const reviewedPages = pages.filter((page) => page.edited).length;
    const pipeline: OcrPipelineInfo | undefined = record.pipeline
      ? { ...record.pipeline, reviewedPages, updatedAt: nowIso() }
      : undefined;
    const nextContent: ExtractedContent = {
      ...record,
      pages,
      pipeline,
      extractedText: pagesToText(pages),
      sections: sectionsFromPages(pages, {
        slideMode: record.fileType === "pptx",
        fallbackTitle: record.metadata.title,
      }),
      metadata: {
        ...record.metadata,
        ...pagesMetadata(pages, pipeline),
        ...(pages.length > 0 ? { pageCount: pages.length } : {}),
      },
    };
    const reindex = await persist(nextContent);
    const page = reindex.content.pages?.find((current) => current.page === focusPage) ?? pages[0];
    return { content: reindex.content, page, reindex };
  },
};
