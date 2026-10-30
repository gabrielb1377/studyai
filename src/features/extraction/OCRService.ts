import { OCR_LIMITS } from "../ocr/limits";
import type { Worker } from "tesseract.js";

type OCRProgress = (progress: number) => void;

export type OCRResult = {
  text: string;
  confidence: number;
  pageCount: number;
};

export type OCRRecognizeOptions = {
  onProgress?: OCRProgress;
  signal?: AbortSignal;
};

let currentProgress: OCRProgress | undefined;
let workerPromise: Promise<Worker> | undefined;
let cancelled = false;

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError() {
  return new DOMException("Processamento cancelado.", "AbortError");
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const firstLine = message.split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 160);
  return firstLine || "Falha inesperada no reconhecimento local.";
}

async function createOCRWorker() {
  const { createWorker } = await import("tesseract.js");
  return createWorker(["por", "eng"], undefined, {
    corePath: "/api/ocr/assets/core.js",
    langPath: "/api/ocr/languages",
    logger: ({ progress }) => currentProgress?.(progress),
    workerPath: "/api/ocr/assets/worker",
  });
}

async function getWorker(onProgress?: OCRProgress) {
  currentProgress = onProgress;
  workerPromise ??= createOCRWorker().catch((error) => {
    workerPromise = undefined;
    throw error;
  });
  return workerPromise;
}

async function terminateWorker() {
  const pending = workerPromise;
  workerPromise = undefined;
  currentProgress = undefined;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // O worker já pode ter sido encerrado por cancelamento.
  }
}

function normalizeText(value: string) {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function recognizeSource(
  source: File | HTMLCanvasElement,
  options: OCRRecognizeOptions = {},
) {
  if (options.signal?.aborted) throw abortError();
  cancelled = false;
  let worker: Awaited<ReturnType<typeof getWorker>> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    worker = await getWorker(options.onProgress);
    if (options.signal?.aborted || cancelled) throw abortError();
    const recognition = worker.recognize(source);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error("O reconhecimento excedeu o tempo limite de 3 minutos nesta página."));
      }, OCR_LIMITS.pageTimeoutMs);
    });
    const result = await Promise.race([recognition, timeoutPromise]);
    if (options.signal?.aborted || cancelled) throw abortError();
    return {
      text: normalizeText(result.data.text),
      confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : undefined,
    };
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted || cancelled) {
      await terminateWorker();
      throw abortError();
    }
    await terminateWorker();
    throw new Error(safeMessage(error));
  } finally {
    if (timeout) clearTimeout(timeout);
    currentProgress = undefined;
    cancelled = false;
  }
}

export const OCRService = {
  async recognizeImage(file: File, options: OCRRecognizeOptions = {}): Promise<OCRResult> {
    const result = await recognizeSource(file, options);
    return {
      text: result.text,
      confidence: result.confidence ?? 0,
      pageCount: 1,
    };
  },

  async recognizeCanvas(canvas: HTMLCanvasElement, options: OCRRecognizeOptions = {}) {
    return recognizeSource(canvas, options);
  },

  async recognizePdf(file: File, options: OCRRecognizeOptions = {}): Promise<OCRResult> {
    const { pdfjs } = await import("react-pdf");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const documentProxy = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const texts: string[] = [];
    const confidences: number[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
        if (options.signal?.aborted) throw abortError();
        const page = await documentProxy.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Não foi possível preparar a página para OCR.");
        await page.render({ canvasContext: context, viewport }).promise;
        const pageOffset = (pageNumber - 1) / documentProxy.numPages;
        const result = await recognizeSource(canvas, {
          signal: options.signal,
          onProgress: (progress) => options.onProgress?.(pageOffset + progress / documentProxy.numPages),
        });
        texts.push(result.text);
        if (typeof result.confidence === "number") confidences.push(result.confidence);
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      await documentProxy.destroy();
    }

    const confidence = confidences.length > 0
      ? confidences.reduce((total, value) => total + value, 0) / confidences.length
      : 0;
    return {
      text: texts.filter(Boolean).join("\n\n"),
      confidence,
      pageCount: documentProxy.numPages,
    };
  },

  async cancel() {
    cancelled = true;
    await terminateWorker();
  },

  reset() {
    cancelled = false;
  },
};
