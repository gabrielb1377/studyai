export const OCR_PIPELINE_VERSION = "ocr-pro-1";

export const OCR_LIMITS = {
  maxPdfPages: 300,
  maxOcrPagesPerRun: 80,
  maxDocumentBytes: 150 * 1024 * 1024,
  maxImageBytes: 40 * 1024 * 1024,
  maxCanvasPixels: 6_000_000,
  minRenderScale: 1,
  maxRenderScale: 3,
  defaultRenderScale: 2,
  maxPageTextChars: 400_000,
  maxTablesPerPage: 12,
  maxTableRows: 60,
  maxTableColumns: 12,
  maxTableCellChars: 2_000,
  pageTimeoutMs: 180_000,
  maxStoredPages: 400,
} as const;

export class OcrLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrLimitError";
  }
}

export function assertDocumentSize(file: File) {
  if (file.size > OCR_LIMITS.maxDocumentBytes) {
    throw new OcrLimitError(
      `O arquivo tem ${Math.round(file.size / (1024 * 1024))} MB e excede o limite de 150 MB para extração local. Divida o documento e importe novamente.`,
    );
  }
}

export function assertImageSize(file: File) {
  if (file.size > OCR_LIMITS.maxImageBytes) {
    throw new OcrLimitError("A imagem excede o limite de 40 MB para reconhecimento local.");
  }
}

export function assertPdfPageCount(pageCount: number) {
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    throw new OcrLimitError("O PDF não possui páginas legíveis.");
  }
  if (pageCount > OCR_LIMITS.maxPdfPages) {
    throw new OcrLimitError(
      `O PDF possui ${pageCount} páginas e excede o limite de ${OCR_LIMITS.maxPdfPages} páginas por documento. Divida o arquivo antes de importar.`,
    );
  }
}

/**
 * O OCR é limitado por execução para preservar memória e responsividade.
 * As páginas excedentes permanecem marcadas para revisão e podem ser
 * reprocessadas individualmente depois.
 */
export function limitOcrSelection(pages: readonly number[]) {
  const selected = Array.from(new Set(pages)).sort((left, right) => left - right);
  const accepted = selected.slice(0, OCR_LIMITS.maxOcrPagesPerRun);
  return {
    accepted,
    deferred: selected.slice(OCR_LIMITS.maxOcrPagesPerRun),
  };
}

export function renderScaleFor(width: number, height: number, requested: number = OCR_LIMITS.defaultRenderScale) {
  const scale = Math.max(OCR_LIMITS.minRenderScale, Math.min(OCR_LIMITS.maxRenderScale, requested));
  const pixels = width * height * scale * scale;
  if (pixels <= OCR_LIMITS.maxCanvasPixels) return scale;
  const adjusted = Math.sqrt(OCR_LIMITS.maxCanvasPixels / Math.max(1, width * height));
  return Math.max(0.5, Math.min(scale, Math.round(adjusted * 100) / 100));
}

export function truncatePageText(text: string) {
  if (text.length <= OCR_LIMITS.maxPageTextChars) return { text, truncated: false };
  return { text: text.slice(0, OCR_LIMITS.maxPageTextChars), truncated: true };
}
