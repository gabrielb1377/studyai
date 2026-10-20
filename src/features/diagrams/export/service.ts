/**
 * Exportação e persistência de diagramas.
 *
 * SVG é gerado a partir do modelo e validado antes do download. PNG é
 * rasterizado localmente a partir do SVG validado (canvas), sem serviços
 * externos. O PNG pode ser salvo na Biblioteca vinculado ao documento do
 * Studio, preservando a fonte editável no próprio Studio.
 */

import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";
import { DIAGRAM_LIMITS } from "../limits";
import { renderDiagramSvg, validateSvgMarkup, type SvgRenderOptions } from "../render/svg";
import type { DiagramDocument, DiagramTheme } from "../types";

export type DiagramExportFormat = "svg" | "png";

export type DiagramExportOptions = {
  theme?: Partial<DiagramTheme>;
  /** Escala do PNG (1 a 3). Ignorada no SVG, que é vetorial. */
  scale?: number;
  /** Fundo transparente no PNG e no SVG. */
  transparent?: boolean;
  caption?: string;
};

export type DiagramExportResult = {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  format: DiagramExportFormat;
};

const PNG_MIME = "image/png";
const SVG_MIME = "image/svg+xml";

export function diagramFileStem(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "diagrama"
  );
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function svgOptions(options: DiagramExportOptions, background: boolean): SvgRenderOptions {
  return {
    theme: options.theme,
    background,
    caption: options.caption,
    scale: 1,
  };
}

/** Gera o SVG validado e devolve também as dimensões reais. */
export function buildDiagramSvg(diagram: DiagramDocument, options: DiagramExportOptions = {}, background = true) {
  const rendered = renderDiagramSvg(diagram, svgOptions(options, background));
  const issues = validateSvgMarkup(rendered.svg);
  if (issues.length) {
    throw new Error(`O SVG gerado foi bloqueado por segurança: ${issues.join(" ")}`);
  }
  return rendered;
}

export function exportDiagramSvg(diagram: DiagramDocument, options: DiagramExportOptions = {}): DiagramExportResult {
  const rendered = buildDiagramSvg(diagram, options, options.transparent !== true);
  const blob = new Blob([rendered.svg], { type: SVG_MIME });
  return {
    blob,
    fileName: `${diagramFileStem(diagram.title)}-diagrama.svg`,
    width: rendered.width,
    height: rendered.height,
    format: "svg",
  };
}

async function rasterize(
  svg: string,
  width: number,
  height: number,
  scale: number,
  transparent: boolean,
): Promise<Blob> {
  const safeScale = Math.min(DIAGRAM_LIMITS.maxPngScale, Math.max(1, scale));
  const targetWidth = Math.min(DIAGRAM_LIMITS.maxPngDimension, Math.round(width * safeScale));
  const targetHeight = Math.min(DIAGRAM_LIMITS.maxPngDimension, Math.round(height * safeScale));

  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível converter o diagrama em imagem."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("O navegador não disponibilizou o contexto de desenho para o PNG.");
    if (!transparent) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PNG_MIME));
    // Libera a memória do canvas mesmo em navegadores sem toBlob.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      throw new Error("Não foi possível gerar o PNG do diagrama (canvas indisponível).");
    }
    if (blob.size > DIAGRAM_LIMITS.maxPngBytes) {
      throw new Error("O PNG gerado excede o tamanho máximo permitido. Reduza a escala.");
    }
    return blob;
  } catch (cause) {
    // Canvas contaminado ou SVG inválido: mensagem acionável, sem detalhes internos.
    if (cause instanceof Error && cause.message.includes("tinted")) {
      throw new Error("Não foi possível gerar o PNG: o navegador bloqueou a conversão da imagem.");
    }
    throw cause;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportDiagramPng(
  diagram: DiagramDocument,
  options: DiagramExportOptions = {},
): Promise<DiagramExportResult> {
  const transparent = options.transparent === true;
  const rendered = buildDiagramSvg(diagram, options, !transparent);
  const blob = await rasterize(rendered.svg, rendered.width, rendered.height, options.scale ?? 2, transparent);
  return {
    blob,
    fileName: `${diagramFileStem(diagram.title)}-diagrama.png`,
    width: rendered.width,
    height: rendered.height,
    format: "png",
  };
}

export type LibraryDiagramContext = {
  studyId?: string;
  contentId?: string;
  studioDocumentId?: string;
  subject?: string;
  topic?: string;
};

/** Salva o PNG do diagrama na Biblioteca vinculado ao documento do Studio. */
export async function saveDiagramToLibrary(
  diagram: DiagramDocument,
  result: DiagramExportResult,
  context: LibraryDiagramContext = {},
): Promise<Material> {
  const now = new Date().toISOString();
  const materialId = `studio-diagram-${diagram.id}`;
  const file = new File([result.blob], result.fileName, { type: PNG_MIME, lastModified: Date.now() });
  const persistentBinary = await MaterialBinaryStorage.save(materialId, file);

  const material: Material = {
    id: materialId,
    fileId: materialId,
    identity: `studio-diagram:${context.studyId ?? "sem-estudo"}:${diagram.id}`,
    name: result.fileName,
    relativePath: `Academy Studio/${context.subject ?? diagram.title}/${result.fileName}`,
    fileType: "png",
    mimeType: PNG_MIME,
    size: file.size,
    lastModified: file.lastModified,
    importedAt: now,
    updatedAt: now,
    progress: 100,
    status: "ready",
    isFavorite: false,
    studyId: context.studyId,
    subject: context.subject,
    topic: context.topic,
    persistentBinary,
    sourceType: "ai-generated",
    academyStudyId: context.studyId,
    academyContentId: context.contentId,
    academyMaterialKind: "generated-diagram",
    academyStudioDocumentId: context.studioDocumentId,
    tags: ["Academy Studio", "Diagrama"],
  };
  await MaterialService.upsert(material);
  return material;
}
