import type {
  DocumentSection,
  ExtractedPage,
  ExtractionMetadata,
  OcrMode,
  OcrPipelineInfo,
} from "../extraction/ExtractionTypes";
import { OCRService, isAbortError } from "../extraction/OCRService";
import { assertDocumentSize, assertImageSize, limitOcrSelection, OCR_LIMITS } from "./limits";
import { openPdfForPages, renderPageToCanvas, inspectPdf } from "./pdf";
import { preprocessCanvas, releaseCanvas, type PreprocessOptions } from "./preprocess";
import { shouldRunOcr } from "./quality";
import {
  buildPipelineInfo,
  createPage,
  pagesMetadata,
  pagesToText,
  sectionsFromPages,
} from "./structure";

export type OcrProgressEvent = {
  phase: "inspect" | "ocr" | "finish";
  progress: number;
  page?: number;
  pages?: number;
  message?: string;
};

export type OcrProcessOptions = {
  mode?: OcrMode;
  pages?: readonly number[];
  signal?: AbortSignal;
  onProgress?: (event: OcrProgressEvent) => void;
  preprocess?: PreprocessOptions;
  /** Reprocessa também páginas corrigidas manualmente. */
  overwriteCorrections?: boolean;
};

export type OcrProcessResult = {
  pages: ExtractedPage[];
  pipeline: OcrPipelineInfo;
  sections: DocumentSection[];
  extractedText: string;
  metadata: Partial<ExtractionMetadata>;
  cancelled: boolean;
  warnings: string[];
};

function nowIso() {
  return new Date().toISOString();
}

const LOW_CONFIDENCE = 55;

function withOcrResult(page: ExtractedPage, text: string, confidence: number | undefined, durationMs: number): ExtractedPage {
  const warnings = [...page.warnings];
  if (typeof confidence === "number" && confidence < LOW_CONFIDENCE) {
    warnings.push(`Confiança baixa informada pelo motor de OCR (${Math.round(confidence)}%).`);
  }
  if (!text.trim()) warnings.push("O OCR não reconheceu texto nesta página.");
  const created = createPage({
    page: page.page,
    text,
    method: "ocr",
    confidence,
    needsOcr: false,
    warnings,
    width: page.width,
    height: page.height,
    rotation: page.rotation,
    durationMs,
    status: !text.trim() || (typeof confidence === "number" && confidence < LOW_CONFIDENCE) ? "review" : undefined,
  });
  return {
    ...created,
    originalText: text,
    tables: created.tables.map((table) => ({ ...table, source: "ocr" as const })),
  };
}

function finish(
  pages: ExtractedPage[],
  options: {
    mode: OcrMode;
    engine: OcrPipelineInfo["engine"];
    createdAt: string;
    durationMs: number;
    cancelled: boolean;
    warnings: string[];
  },
  extraMetadata: Partial<ExtractionMetadata> = {},
): OcrProcessResult {
  const sorted = [...pages].sort((left, right) => left.page - right.page);
  const pipeline = buildPipelineInfo({
    pages: sorted,
    mode: options.mode,
    engine: options.engine,
    createdAt: options.createdAt,
    cancelled: options.cancelled,
    warnings: options.warnings,
    durationMs: options.durationMs,
  });
  return {
    pages: sorted,
    pipeline,
    sections: sectionsFromPages(sorted),
    extractedText: pagesToText(sorted),
    metadata: { ...pagesMetadata(sorted, pipeline), ...extraMetadata },
    cancelled: options.cancelled,
    warnings: options.warnings,
  };
}

function unprocessed(page: ExtractedPage, message: string): ExtractedPage {
  return {
    ...page,
    status: "review",
    warnings: Array.from(new Set([...page.warnings, message])),
  };
}

export const DocumentOcrEngine = {
  async processPdf(file: File, options: OcrProcessOptions = {}): Promise<OcrProcessResult> {
    const mode = options.mode ?? "auto";
    const createdAt = nowIso();
    const startedAt = performance.now();
    assertDocumentSize(file);

    options.onProgress?.({ phase: "inspect", progress: 2, message: "Inspecionando páginas e camada de texto." });
    const inspection = await inspectPdf(file, { shouldContinue: () => !options.signal?.aborted });
    if (options.signal?.aborted) {
      const pages = inspection.pages.map((page) => createPage({
        page: page.page,
        text: page.text,
        method: page.text ? "native" : "none",
        width: page.width,
        height: page.height,
        rotation: page.rotation,
        needsOcr: true,
      }));
      return finish(pages, {
        mode, engine: "pdfjs", createdAt, durationMs: Math.round(performance.now() - startedAt),
        cancelled: true, warnings: ["Processamento cancelado durante a inspeção do PDF."],
      });
    }

    const nativePages = inspection.pages.map((page) => {
      const needsOcr = shouldRunOcr({
        mode,
        text: page.text,
        hasImages: page.hasImages,
        imageAreaRatio: page.imageAreaRatio,
      });
      return createPage({
        page: page.page,
        text: page.text,
        method: page.text ? "native" : "none",
        needsOcr,
        width: page.width,
        height: page.height,
        rotation: page.rotation,
      });
    });

    const warnings: string[] = [];
    if (inspection.pages.some((page) => page.rotation % 360 !== 0)) {
      warnings.push("Páginas com rotação foram renderizadas na orientação informada pelo PDF.");
    }

    const selection = options.pages?.length
      ? new Set(options.pages)
      : new Set(nativePages.map((page) => page.page));
    const candidates = mode === "native"
      ? []
      : nativePages
        .filter((page) => selection.has(page.page))
        .filter((page) => mode === "force" || page.needsOcr)
        .filter((page) => options.overwriteCorrections || !page.edited)
        .map((page) => page.page);
    const { accepted, deferred } = limitOcrSelection(candidates);
    if (deferred.length > 0) {
      warnings.push(
        `OCR limitado a ${OCR_LIMITS.maxOcrPagesPerRun} páginas nesta execução. As páginas ${deferred.slice(0, 8).join(", ")}${deferred.length > 8 ? "…" : ""} ficaram marcadas para revisão.`,
      );
    }

    const pagesByNumber = new Map(nativePages.map((page) => [page.page, page]));
    let cancelled = false;

    if (accepted.length > 0) {
      const documentProxy = await openPdfForPages(file);
      const abortListener = () => { void OCRService.cancel(); };
      options.signal?.addEventListener("abort", abortListener);
      try {
        for (const [index, pageNumber] of accepted.entries()) {
          if (options.signal?.aborted) {
            cancelled = true;
            break;
          }
          const pageStartedAt = performance.now();
          options.onProgress?.({
            phase: "ocr",
            progress: 20 + Math.round((index / accepted.length) * 75),
            page: pageNumber,
            pages: accepted.length,
            message: `Reconhecendo texto da página ${pageNumber} de ${inspection.numPages}.`,
          });
          let canvas: HTMLCanvasElement | undefined;
          let processed: HTMLCanvasElement | undefined;
          try {
            const pageProxy = await documentProxy.page(pageNumber);
            canvas = await renderPageToCanvas(pageProxy, { scale: OCR_LIMITS.defaultRenderScale });
            processed = preprocessCanvas(canvas, options.preprocess);
            const result = await OCRService.recognizeCanvas(processed, {
              signal: options.signal,
              onProgress: (progress) => options.onProgress?.({
                phase: "ocr",
                progress: 20 + Math.round(((index + progress) / accepted.length) * 75),
                page: pageNumber,
                pages: accepted.length,
              }),
            });
            const nativePage = pagesByNumber.get(pageNumber);
            if (nativePage) {
              pagesByNumber.set(pageNumber, withOcrResult(
                nativePage,
                result.text,
                result.confidence,
                Math.round(performance.now() - pageStartedAt),
              ));
            }
          } catch (error) {
            if (isAbortError(error) || options.signal?.aborted) {
              cancelled = true;
              break;
            }
            const nativePage = pagesByNumber.get(pageNumber);
            if (nativePage) {
              pagesByNumber.set(pageNumber, {
                ...nativePage,
                status: "error",
                warnings: Array.from(new Set([
                  ...nativePage.warnings,
                  error instanceof Error ? error.message : "Falha ao reconhecer esta página.",
                ])),
              });
            }
          } finally {
            releaseCanvas(canvas);
            if (processed && processed !== canvas) releaseCanvas(processed);
          }
        }
      } finally {
        options.signal?.removeEventListener("abort", abortListener);
        await documentProxy.close();
      }
    } else if (mode === "native") {
      warnings.push("Modo texto nativo: o OCR não foi executado.");
    } else if (nativePages.every((page) => page.text.trim())) {
      warnings.push("Nenhuma página precisou de OCR.");
    }

    if (cancelled) {
      warnings.push("Processamento cancelado pelo usuário; páginas pendentes podem ser reprocessadas.");
    }

    const pages = [...pagesByNumber.values()].map((page) => {
      if (!cancelled) return page;
      if (page.status === "error" || page.method === "ocr") return page;
      if (accepted.includes(page.page) && page.needsOcr) {
        return unprocessed(page, "Página não processada: cancelamento solicitado.");
      }
      return page;
    });

    options.onProgress?.({ phase: "finish", progress: 100, message: "Extração concluída." });
    return finish(pages, {
      mode,
      engine: "pdfjs",
      createdAt,
      durationMs: Math.round(performance.now() - startedAt),
      cancelled,
      warnings,
    });
  },

  async processImage(file: File, options: OcrProcessOptions = {}): Promise<OcrProcessResult> {
    const mode = options.mode ?? "auto";
    const createdAt = nowIso();
    const startedAt = performance.now();
    assertImageSize(file);
    options.onProgress?.({ phase: "inspect", progress: 5, message: "Preparando a imagem para reconhecimento." });

    const bitmap = await createImageBitmap(file);
    try {
      const width = bitmap.width;
      const height = bitmap.height;
      const scale = Math.min(1, Math.sqrt(OCR_LIMITS.maxCanvasPixels / Math.max(1, width * height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Não foi possível preparar a imagem para OCR.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      if (mode === "native") {
        releaseCanvas(canvas);
        const page = createPage({
          page: 1,
          text: "",
          method: "none",
          needsOcr: true,
          width,
          height,
          warnings: ["Imagens não possuem camada de texto; use o modo automático ou OCR forçado."],
        });
        return finish([page], {
          mode, engine: "none", createdAt, durationMs: Math.round(performance.now() - startedAt),
          cancelled: false, warnings: ["Modo texto nativo não executa OCR em imagens."],
        });
      }

      let processed: HTMLCanvasElement | undefined;
      try {
        processed = preprocessCanvas(canvas, options.preprocess);
        const result = await OCRService.recognizeCanvas(processed, {
          signal: options.signal,
          onProgress: (progress) => options.onProgress?.({
            phase: "ocr",
            progress: 10 + Math.round(progress * 85),
            page: 1,
            pages: 1,
          }),
        });

        const page = withOcrResult(createPage({
          page: 1,
          text: "",
          method: "none",
          needsOcr: true,
          width,
          height,
        }), result.text, result.confidence, Math.round(performance.now() - startedAt));

        return finish([page], {
          mode,
          engine: "tesseract.js",
          createdAt,
          durationMs: Math.round(performance.now() - startedAt),
          cancelled: false,
          warnings: [],
        }, { width, height });
      } catch (error) {
        if (isAbortError(error) || options.signal?.aborted) {
          const page = createPage({
            page: 1,
            text: "",
            method: "none",
            needsOcr: true,
            width,
            height,
            warnings: ["Reconhecimento cancelado pelo usuário."],
          });
          return finish([page], {
            mode,
            engine: "tesseract.js",
            createdAt,
            durationMs: Math.round(performance.now() - startedAt),
            cancelled: true,
            warnings: ["Reconhecimento cancelado pelo usuário."],
          });
        }
        throw error;
      } finally {
        if (processed && processed !== canvas) releaseCanvas(processed);
        releaseCanvas(canvas);
      }
    } finally {
      bitmap.close();
    }
  },
};
