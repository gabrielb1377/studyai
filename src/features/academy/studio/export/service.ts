/**
 * Serviço de exportação do Academy Studio.
 *
 * Consome o documento estruturado do Studio, gera PDF ou PPTX e persiste o
 * artefato na Biblioteca vinculado ao documento-fonte. A exportação é local
 * (navegador), não usa IA e não altera o documento original.
 */

import { ContentStorage } from "@/features/extraction/ContentStorage";
import type { ExtractedContent, IngestionStage } from "@/features/extraction/ExtractionTypes";
import { ChunkService } from "@/features/retrieval/ChunkService";
import { ChunkStorage } from "@/features/retrieval/ChunkStorage";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";
import { buildDeckModel, buildDocumentModel, modelToMarkdown } from "./model";
import type { StudioPdfOptions } from "./pdf";
import type { StudioDocument, StudioExportRecord } from "../types";

export type StudioExportKind = "pdf" | "pptx";

/** Limites de segurança e desempenho aplicados antes de gerar o artefato. */
export const STUDIO_EXPORT_LIMITS = {
  maxSections: 400,
  maxSlides: 200,
  maxCharacters: 1_000_000,
} as const;

export type StudioExportResult = {
  material: Material;
  record: StudioExportRecord;
  fileName: string;
  size: number;
  pageCount?: number;
  slideCount?: number;
};

const PDF_MIME = "application/pdf";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

type ExportArtifact = {
  blob: Blob;
  fileName: string;
  pageCount?: number;
  slideCount?: number;
};

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function stages(now: string): IngestionStage[] {
  return [
    { id: "document", status: "skipped", message: "Documento virtual do Academy Studio.", completedAt: now },
    { id: "extraction", status: "skipped", message: "Conteúdo estruturado já disponível.", completedAt: now },
    { id: "ocr", status: "skipped", message: "OCR desnecessário.", completedAt: now },
    { id: "normalization", status: "completed", message: "Normalização concluída no exportador.", completedAt: now },
    { id: "analysis", status: "completed", message: "Estrutura analisada no Studio.", completedAt: now },
    { id: "study", status: "completed", message: "Vínculo com o estudo de origem preservado.", completedAt: now },
    { id: "semantic", status: "skipped", message: "Análise semântica não é regerada na exportação.", completedAt: now },
    { id: "chunks", status: "completed", message: "Trechos indexados a partir do documento exportado.", completedAt: now },
    { id: "embeddings", status: "skipped", message: "Embeddings não são regerados na exportação.", completedAt: now },
    { id: "indexed", status: "completed", message: "Exportação disponível na Biblioteca.", completedAt: now },
  ];
}

function assertExportable(document: StudioDocument) {
  const sections = document.documentStructure?.sections.length ?? 0;
  const slides = document.slides?.length ?? 0;
  if (sections > STUDIO_EXPORT_LIMITS.maxSections) {
    throw new Error(`O documento tem ${sections} seções, acima do limite de ${STUDIO_EXPORT_LIMITS.maxSections} para exportação.`);
  }
  if (slides > STUDIO_EXPORT_LIMITS.maxSlides) {
    throw new Error(`A apresentação tem ${slides} slides, acima do limite de ${STUDIO_EXPORT_LIMITS.maxSlides} para exportação.`);
  }
  const characters = (document.documentStructure?.sections ?? [])
    .reduce((total, section) => total + (section.content?.length ?? 0), 0)
    + (document.slides ?? []).reduce((total, slide) => total + (slide.content?.length ?? 0), 0);
  if (characters > STUDIO_EXPORT_LIMITS.maxCharacters) {
    throw new Error(`O conteúdo tem ${characters} caracteres, acima do limite de ${STUDIO_EXPORT_LIMITS.maxCharacters} para exportação.`);
  }
}

export const StudioExportService = {
  /** Gera o artefato do documento sem persistir na Biblioteca. */
  async render(document: StudioDocument, kind: StudioExportKind, options: StudioPdfOptions): Promise<ExportArtifact> {
    if (kind === "pdf") {
      const { StudioPdfExporter } = await import("./pdf");
      const model = buildDocumentModel(document);
      return StudioPdfExporter.generate(model, document.customization, options);
    }
    const { StudioPptxExporter } = await import("./pptx");
    const deck = buildDeckModel(document);
    return StudioPptxExporter.generate(deck, document.customization);
  },

  /**
   * Gera, persiste na Biblioteca e baixa o artefato exportado.
   * O identificador do material é estável por (documento, formato): reexportar
   * substitui o artefato anterior em vez de duplicá-lo.
   */
  async export(
    document: StudioDocument,
    kind: StudioExportKind,
    options: StudioPdfOptions & { studySubject?: string; studyTopic?: string; download?: boolean } = { includeAnswers: true },
  ): Promise<StudioExportResult> {
    assertExportable(document);
    const documentModel = kind === "pdf" ? buildDocumentModel(document) : undefined;
    const deckModel = kind === "pptx" ? buildDeckModel(document) : undefined;
    const artifact: ExportArtifact = kind === "pdf"
      ? await (await import("./pdf")).StudioPdfExporter.generate(documentModel!, document.customization, options)
      : await (await import("./pptx")).StudioPptxExporter.generate(deckModel!, document.customization);

    const now = new Date().toISOString();
    const materialId = `studio-export-${document.id}-${kind}`;
    const fileType = kind === "pdf" ? "pdf" : "pptx";
    const mimeType = kind === "pdf" ? PDF_MIME : PPTX_MIME;
    const file = new File([artifact.blob], artifact.fileName, { type: mimeType, lastModified: Date.now() });
    const persistentBinary = await MaterialBinaryStorage.save(materialId, file);

    const material: Material = {
      id: materialId,
      fileId: materialId,
      identity: `studio-export:${document.studyId}:${document.id}:${kind}`,
      name: artifact.fileName,
      relativePath: `Academy Studio/${options.studySubject ?? document.title}/${artifact.fileName}`,
      fileType,
      mimeType,
      size: file.size,
      lastModified: file.lastModified,
      importedAt: now,
      updatedAt: now,
      progress: 100,
      status: "ready",
      isFavorite: false,
      studyId: document.studyId,
      subject: options.studySubject,
      topic: options.studyTopic,
      persistentBinary,
      sourceType: "ai-generated",
      academyStudyId: document.studyId,
      academyContentId: document.contentId,
      academyMaterialKind: kind === "pdf" ? "generated-pdf" : "generated-presentation",
      academyStudioDocumentId: document.id,
      tags: ["Academy Studio", kind === "pdf" ? "PDF Gerado" : "Apresentação Gerada"],
    };
    await MaterialService.upsert(material);

    const markdown = documentModel
      ? modelToMarkdown(documentModel)
      : deckModel!.slides.map((slide) => `## ${slide.title}\n\n${slide.blocks.map((block) => ("text" in block ? block.text : "")).join("\n\n")}`).join("\n\n");
    const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
    const extracted: ExtractedContent = {
      id: `studio-export-content-${document.id}-${kind}`,
      studyId: document.studyId,
      fileId: materialId,
      fileType,
      extractedText: markdown,
      sections: [
        { type: "heading", text: document.title, level: 1 },
        ...(documentModel
          ? documentModel.sections.map((section) => ({ type: "paragraph" as const, text: section.title }))
          : deckModel!.slides.map((slide) => ({ type: "heading" as const, text: slide.title, level: 2 }))),
      ],
      metadata: {
        name: artifact.fileName,
        type: mimeType,
        size: file.size,
        title: document.title,
        subject: options.studySubject,
        topic: options.studyTopic,
        keywords: document.documentStructure?.metadata.keywords ?? [],
        pageCount: artifact.pageCount,
        language: "pt-BR",
        wordCount,
        readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 220)),
        analysisStatus: "analyzed",
        analyzedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      stages: stages(now),
      logs: [{ id: `studio-export-log-${document.id}-${kind}`, stage: "indexed", status: "completed", message: "Exportação do Academy Studio indexada na Biblioteca.", createdAt: now }],
      status: "extracted",
      createdAt: now,
    };
    await ContentStorage.upsert(extracted);
    const chunks = ChunkService.createChunks(extracted);
    await ChunkStorage.replaceForContent(extracted.id, chunks);

    const record: StudioExportRecord = {
      id: materialId,
      kind,
      format: fileType,
      fileName: artifact.fileName,
      size: file.size,
      pageCount: artifact.pageCount,
      slideCount: artifact.slideCount,
      materialId,
      persistentBinary,
      createdAt: now,
    };

    if (options.download !== false) download(artifact.blob, artifact.fileName);

    return {
      material,
      record,
      fileName: artifact.fileName,
      size: file.size,
      pageCount: artifact.pageCount,
      slideCount: artifact.slideCount,
    };
  },
};
