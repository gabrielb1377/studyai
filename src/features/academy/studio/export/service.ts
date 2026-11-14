/**
 * Serviço de exportação do Academy Studio.
 *
 * Consome o documento estruturado do Studio, gera PDF ou PPTX e persiste o
 * artefato na Biblioteca vinculado ao documento-fonte. A exportação é local
 * (navegador), não usa IA e não altera o documento original.
 */

import { EXTRACTION_UPDATE_EVENT } from "@/features/extraction/ContentStorage";
import { StorageManager } from "@/lib/storage/StorageManager";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import type { ContentChunk } from "@/features/retrieval/RetrievalTypes";
import type { ExtractedContent, IngestionStage } from "@/features/extraction/ExtractionTypes";
import { ChunkService } from "@/features/retrieval/ChunkService";
import { CHUNKS_UPDATE_EVENT } from "@/features/retrieval/ChunkStorage";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MATERIALS_UPDATED_EVENT } from "@/services/material-service";
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
    const operation = SessionOperationManager.start();
    try {
    const documentModel = kind === "pdf" ? buildDocumentModel(document) : undefined;
    const deckModel = kind === "pptx" ? buildDeckModel(document) : undefined;
    const artifact: ExportArtifact = kind === "pdf"
      ? await (await import("./pdf")).StudioPdfExporter.generate(documentModel!, document.customization, options)
      : await (await import("./pptx")).StudioPptxExporter.generate(deckModel!, document.customization);

    operation.assertCurrent();
    const now = new Date().toISOString();
    const materialId = `studio-export-${document.id}-${kind}`;
    const fileType = kind === "pdf" ? "pdf" : "pptx";
    const mimeType = kind === "pdf" ? PDF_MIME : PPTX_MIME;
    const file = new File([artifact.blob], artifact.fileName, { type: mimeType, lastModified: Date.now() });
    const binaryStorageId = `${materialId}-${crypto.randomUUID()}`;
    const persistentBinary = await MaterialBinaryStorage.save(binaryStorageId, file);
    if (!persistentBinary) throw new Error("Não foi possível salvar o arquivo local. Tente novamente.");
    operation.assertCurrent();

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
      binaryStorageId,
      studioExportVersion: document.version,
      sourceType: "ai-generated",
      academyStudyId: document.studyId,
      academyContentId: document.contentId,
      academyMaterialKind: kind === "pdf" ? "generated-pdf" : "generated-presentation",
      academyStudioDocumentId: document.id,
      tags: ["Academy Studio", kind === "pdf" ? "PDF Gerado" : "Apresentação Gerada"],
    };
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
    const chunks = ChunkService.createChunks(extracted);
    await StorageManager.transaction(["documents", "contents", "chunks", "embeddings"], async (storage) => {
      const previous = await storage.get<Material>("documents", materialId);
      operation.assertCurrent();
      if (previous?.studioExportVersion !== undefined && previous.studioExportVersion > document.version) {
        throw new Error("Uma revisão mais recente já foi publicada.");
      }
      const previousChunks = await storage.getAll<ContentChunk>("chunks");
      for (const chunk of previousChunks) {
        if (chunk.metadata.extractedContentId === extracted.id) {
          await storage.delete("chunks", chunk.id);
          await storage.delete("embeddings", chunk.id);
        }
      }
      operation.assertCurrent();
      await storage.put("contents", extracted);
      for (const chunk of chunks) await storage.put("chunks", chunk);
      await storage.put("documents", {
        ...material,
        importedAt: previous?.importedAt ?? material.importedAt,
        isFavorite: previous?.isFavorite ?? material.isFavorite,
      });
    });
    operation.assertCurrent();
    MaterialRuntimeStore.remove(materialId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(EXTRACTION_UPDATE_EVENT));
      window.dispatchEvent(new Event(CHUNKS_UPDATE_EVENT));
      window.dispatchEvent(new Event(MATERIALS_UPDATED_EVENT));
    }

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
    } finally {
      operation.release();
    }
  },
};
