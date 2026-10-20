import { pdfjs } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
import { assertPdfPageCount, OCR_LIMITS, renderScaleFor } from "./limits";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export type PageInspection = {
  page: number;
  text: string;
  letters: number;
  hasImages: boolean;
  imageAreaRatio: number;
  rotation: number;
  width: number;
  height: number;
};

export type PdfInspection = {
  numPages: number;
  pages: PageInspection[];
  title?: string;
};

const IMAGE_OPERATORS = new Set([
  "paintImageXObject",
  "paintInlineImageXObject",
  "paintImageMaskXObject",
  "paintImageMaskXObjectRepeat",
  "paintImageXObjectRepeat",
  "paintJpegXObject",
]);

function multiply(left: readonly number[], right: readonly number[]) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

async function imageCoverage(page: PDFPageProxy) {
  try {
    const operatorList = await page.getOperatorList();
    const ops = pdfjs.OPS as unknown as Record<string, number> | undefined;
    if (!ops) return { hasImages: false, ratio: 0 };
    const [x0, y0, x1, y1] = page.view as number[];
    const pageArea = Math.max(1, Math.abs((x1 - x0) * (y1 - y0)));
    let current = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    let area = 0;
    let found = false;

    for (const [index, operation] of operatorList.fnArray.entries()) {
      const name = Object.keys(ops).find((key) => ops[key] === operation);
      if (!name) continue;
      if (name === "save") stack.push([...current]);
      else if (name === "restore") current = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (name === "transform") current = multiply(current, operatorList.argsArray[index] as number[]);
      else if (IMAGE_OPERATORS.has(name)) {
        found = true;
        const [a, b, c, d] = current;
        area += Math.abs(a * d - b * c);
      }
    }

    return { hasImages: found, ratio: Math.min(1, area / pageArea) };
  } catch {
    return { hasImages: false, ratio: 0 };
  }
}

async function getDocument(file: File) {
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
}

export async function inspectPdf(
  file: File,
  options: { shouldContinue?: () => boolean } = {},
): Promise<PdfInspection> {
  const documentProxy = await getDocument(file);
  const pages: PageInspection[] = [];
  try {
    assertPdfPageCount(documentProxy.numPages);
    const metadata = await documentProxy.getMetadata().catch(() => null);
    const info = metadata?.info as { Title?: string } | undefined;
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      if (options.shouldContinue && !options.shouldContinue()) break;
      const page = await documentProxy.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      const coverage = await imageCoverage(page);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        page: pageNumber,
        text: text.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim(),
        letters: (text.match(/\p{L}/gu) ?? []).length,
        hasImages: coverage.hasImages,
        imageAreaRatio: coverage.ratio,
        rotation: page.rotate,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      });
    }
    return { numPages: documentProxy.numPages, pages, title: info?.Title?.trim() || undefined };
  } finally {
    await documentProxy.destroy();
  }
}

export async function renderPdfPage(
  file: File,
  pageNumber: number,
  options: { scale?: number; maxWidth?: number; canvas?: HTMLCanvasElement } = {},
) {
  const documentProxy = await getDocument(file);
  try {
    const page = await documentProxy.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const widthScale = options.maxWidth ? options.maxWidth / Math.max(1, base.width) : undefined;
    const scale = renderScaleFor(base.width, base.height, Math.min(
      options.scale ?? OCR_LIMITS.defaultRenderScale,
      widthScale ?? OCR_LIMITS.maxRenderScale,
      OCR_LIMITS.maxRenderScale,
    ));
    const viewport = page.getViewport({ scale });
    const canvas = options.canvas ?? document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Não foi possível preparar a página do PDF.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  } finally {
    await documentProxy.destroy();
  }
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  options: { scale?: number } = {},
) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: renderScaleFor(base.width, base.height, options.scale) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Não foi possível preparar a página do PDF para OCR.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

export async function openPdfForPages(file: File) {
  const documentProxy = await getDocument(file);
  return {
    numPages: documentProxy.numPages,
    page: (pageNumber: number) => documentProxy.getPage(pageNumber),
    close: () => documentProxy.destroy(),
  };
}
