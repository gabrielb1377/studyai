import type {
  DocumentSection,
  ExtractedPage,
  OcrMode,
  OcrPipelineInfo,
  PageMethod,
  PageStatus,
} from "../extraction/ExtractionTypes";
import { TextNormalizationService } from "../extraction/TextNormalizationService";
import { OCR_PIPELINE_VERSION } from "./limits";
import { assessTextQuality, documentQuality, unknownQuality } from "./quality";
import { structureTables } from "./tables";

type PageInput = {
  page: number;
  text: string;
  method: PageMethod;
  needsOcr?: boolean;
  confidence?: number;
  status?: PageStatus;
  warnings?: string[];
  width?: number;
  height?: number;
  rotation?: number;
  durationMs?: number;
};

function normalized(value: string) {
  return TextNormalizationService.normalize(value);
}

export function createPage(input: PageInput): ExtractedPage {
  const text = normalized(input.text);
  const structured = structureTables(text, input.page);
  const quality = input.method === "none" ? unknownQuality() : assessTextQuality(structured.text);
  const warnings = [...(input.warnings ?? [])];
  if (structured.text.length > 0 && structured.tables.some((table) => !table.complete)) {
    warnings.push("Tabela com estrutura irregular; confira as células antes de usar no Tutor.");
  }
  const status: PageStatus = input.status ?? (
    input.method === "none" || input.needsOcr || quality.level === "poor" ? "review" : "ready"
  );
  return {
    page: input.page,
    method: input.method,
    status,
    text: structured.text,
    originalText: structured.text,
    edited: false,
    needsOcr: input.needsOcr ?? false,
    confidence: typeof input.confidence === "number" && Number.isFinite(input.confidence) ? input.confidence : undefined,
    quality,
    tables: structured.tables,
    warnings: Array.from(new Set(warnings)),
    width: input.width,
    height: input.height,
    rotation: input.rotation,
    durationMs: input.durationMs,
  };
}

export function restructurePageText(text: string, page: number, source: "text" | "ocr" = "text") {
  const structured = structureTables(normalized(text), page);
  return {
    ...structured,
    tables: structured.tables.map((table) => ({ ...table, source })),
  };
}

export function pagesFromSections(sections: readonly DocumentSection[], options: { slideMode?: boolean } = {}): ExtractedPage[] {
  const grouped = new Map<number, DocumentSection[]>();
  for (const section of sections) {
    const page = options.slideMode ? section.slide : section.page;
    const key = typeof page === "number" && page > 0 ? page : 1;
    grouped.set(key, [...(grouped.get(key) ?? []), section]);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([page, pageSections]) => {
      const text = pageSections.map((section) => section.text).join("\n\n");
      return createPage({ page, text, method: "native", needsOcr: false });
    });
}

export function sectionsFromPages(pages: readonly ExtractedPage[], options: { slideMode?: boolean; fallbackTitle?: string } = {}): DocumentSection[] {
  const sections: DocumentSection[] = [];
  if (options.fallbackTitle && pages.length > 0 && !pages[0].text.trim().toLowerCase().startsWith(options.fallbackTitle.trim().toLowerCase())) {
    sections.push({ type: "title", text: options.fallbackTitle, page: pages[0].page });
  }
  for (const page of pages) {
    if (!page.text.trim()) continue;
    const pageSections = TextNormalizationService.toSections(page.text);
    for (const section of pageSections) {
      const table = page.tables.find((candidate) => section.text.includes(candidate.markdown) || candidate.markdown.includes(section.text));
      sections.push({
        ...section,
        page: page.page,
        ...(options.slideMode ? { slide: page.page } : {}),
        ...(table ? { tableId: table.id } : {}),
      });
    }
  }
  return sections;
}

export function pagesToText(pages: readonly ExtractedPage[]) {
  return pages
    .filter((page) => page.text.trim().length > 0)
    .map((page) => page.text.trim())
    .join("\n\n");
}

export function tableFromPages(pages: readonly ExtractedPage[], tableId: string) {
  for (const page of pages) {
    const table = page.tables.find((candidate) => candidate.id === tableId);
    if (table) return { page, table };
  }
  return null;
}

function normalizeForMatch(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
}

export function pageRangeForText(pages: readonly ExtractedPage[], text: string): { pageStart?: number; pageEnd?: number } {
  if (pages.length === 0) return {};
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return {};

  const head = normalizedText.slice(0, 60);
  const tail = normalizedText.slice(-60);
  const startPage = pages.find((page) => normalizeForMatch(page.text).includes(head));
  const endPage = [...pages].reverse().find((page) => normalizeForMatch(page.text).includes(tail));

  if (startPage) {
    return { pageStart: startPage.page, pageEnd: endPage?.page ?? startPage.page };
  }

  const words = Array.from(new Set(normalizedText.split(" ").filter((word) => word.length >= 5))).slice(0, 24);
  const matches = pages.filter((page) => {
    const pageText = normalizeForMatch(page.text);
    return words.filter((word) => pageText.includes(word)).length >= Math.min(3, words.length);
  });
  if (matches.length === 0) return {};
  return { pageStart: matches[0].page, pageEnd: matches[matches.length - 1].page };
}

export function buildPipelineInfo(input: {
  pages: readonly ExtractedPage[];
  mode: OcrMode;
  engine: OcrPipelineInfo["engine"];
  createdAt: string;
  updatedAt?: string;
  cancelled?: boolean;
  warnings?: string[];
  durationMs?: number;
}): OcrPipelineInfo {
  return {
    version: OCR_PIPELINE_VERSION,
    mode: input.mode,
    engine: input.engine,
    pages: input.pages.length,
    nativePages: input.pages.filter((page) => page.method === "native").length,
    ocrPages: input.pages.filter((page) => page.method === "ocr").length,
    failedPages: input.pages.filter((page) => page.status === "error").length,
    reviewedPages: input.pages.filter((page) => page.edited).length,
    cancelled: input.cancelled ?? false,
    durationMs: input.durationMs,
    warnings: Array.from(new Set(input.warnings ?? [])),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}

export function pagesMetadata(pages: readonly ExtractedPage[], pipeline?: OcrPipelineInfo) {
  const ocrPages = pages.filter((page) => page.method === "ocr");
  const confidences = ocrPages
    .map((page) => page.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const base = {
    pageCount: pages.length || undefined,
    hasTextLayer: pages.some((page) => page.method === "native" && page.text.trim().length > 0),
    hasScannedPages: pages.some((page) => page.needsOcr),
    ocrConfidence: confidences.length > 0
      ? Math.round((confidences.reduce((total, value) => total + value, 0) / confidences.length) * 10) / 10
      : undefined,
    extractionMode: pipeline?.mode,
    pipelineVersion: pipeline?.version,
    ocrPages: ocrPages.length,
    nativePages: pages.filter((page) => page.method === "native").length,
    failedPages: pages.filter((page) => page.status === "error").length,
    reviewedPages: pages.filter((page) => page.edited).length,
    quality: documentQuality(pages),
  };
  return ocrPages.length > 0 ? { ...base, ocrPerformed: true } : base;
}
