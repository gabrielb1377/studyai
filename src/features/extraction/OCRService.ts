type OCRProgress = (progress: number) => void;

export type OCRResult = {
  text: string;
  confidence: number;
  pageCount: number;
};

let currentProgress: OCRProgress | undefined;
let workerPromise: ReturnType<typeof createOCRWorker> | undefined;

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

function normalizeText(value: string) {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function recognizeSource(
  source: File | HTMLCanvasElement,
  onProgress?: OCRProgress,
) {
  try {
    const worker = await getWorker(onProgress);
    const result = await worker.recognize(source);
    return {
      text: normalizeText(result.data.text),
      confidence: result.data.confidence,
    };
  } finally {
    currentProgress = undefined;
  }
}

export const OCRService = {
  async recognizeImage(file: File, onProgress?: OCRProgress): Promise<OCRResult> {
    const result = await recognizeSource(file, onProgress);
    return { ...result, pageCount: 1 };
  },

  async recognizePdf(file: File, onProgress?: OCRProgress): Promise<OCRResult> {
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
        const page = await documentProxy.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Não foi possível preparar a página para OCR.");
        await page.render({ canvasContext: context, viewport }).promise;
        const pageOffset = (pageNumber - 1) / documentProxy.numPages;
        const result = await recognizeSource(canvas, (progress) => {
          onProgress?.(pageOffset + progress / documentProxy.numPages);
        });
        texts.push(result.text);
        confidences.push(result.confidence);
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
};
