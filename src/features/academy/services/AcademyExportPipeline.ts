import { ContentStorage } from "@/features/extraction/ContentStorage";
import type { ExtractedContent, IngestionStage, IngestionStageId } from "@/features/extraction/ExtractionTypes";
import { ChunkService } from "@/features/retrieval/ChunkService";
import { ChunkStorage } from "@/features/retrieval/ChunkStorage";
import { EmbeddingStorage } from "@/features/retrieval/EmbeddingStorage";
import { KnowledgeService } from "@/features/semantic/KnowledgeService";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialService } from "@/services/material-service";
import type { AcademyMaterialKind, Material } from "@/types/material";
import type { StudyChapter } from "@/types/study-engine";
import { AcademyStorage } from "../storage/AcademyStorage";
import { academyLabels, type AcademyExportKind, type AcademyExportRecord, type AcademyGeneratedContent, type AcademyStudy } from "../types";
import { academyContentToMarkdown } from "./AcademyContentFormatter";

type GeneratedArtifact = {
  blob: Blob;
  fileName: string;
  pageCount?: number;
  slideCount?: number;
};

const allStages: IngestionStageId[] = ["document", "extraction", "ocr", "normalization", "analysis", "study", "semantic", "chunks", "embeddings", "indexed"];

function stages(now: string): IngestionStage[] {
  return allStages.map((id) => ({
    id,
    status: id === "ocr" ? "skipped" : "completed",
    message: id === "ocr" ? "OCR desnecessário para conteúdo gerado." : "Etapa concluída a partir da fonte estruturada da Academy.",
    completedAt: now,
  }));
}

function materialKind(kind: AcademyExportKind): AcademyMaterialKind {
  if (kind === "presentation") return "generated-presentation";
  if (kind === "workbook") return "generated-workbook";
  return "generated-pdf";
}

function format(kind: AcademyExportKind) {
  return kind === "presentation" ? "pptx" as const : "pdf" as const;
}

function chapters(content: AcademyGeneratedContent): StudyChapter[] {
  return content.chapters.map((chapter, index) => ({ id: chapter.id, title: chapter.title, marker: "chapter", order: index }));
}

export const AcademyExportPipeline = {
  async persist(study: AcademyStudy, content: AcademyGeneratedContent, kind: AcademyExportKind, artifact: GeneratedArtifact) {
    const now = new Date().toISOString();
    const artifactFormat = format(kind);
    const materialId = `academy-export-${content.id}-${kind}`;
    const file = new File([artifact.blob], artifact.fileName, {
      type: artifactFormat === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      lastModified: Date.now(),
    });
    const persistentBinary = await MaterialBinaryStorage.save(materialId, file);
    const material: Material = {
      id: materialId,
      fileId: materialId,
      identity: `academy-export:${study.id}:${content.id}:${kind}`,
      name: artifact.fileName,
      relativePath: `Academy/${study.subject}/${study.topic}/Exportações/${artifact.fileName}`,
      fileType: artifactFormat,
      mimeType: file.type,
      size: file.size,
      lastModified: file.lastModified,
      importedAt: now,
      updatedAt: now,
      progress: study.progress,
      status: "ready",
      isFavorite: false,
      studyId: study.id,
      subject: study.subject,
      topic: study.topic,
      persistentBinary,
      sourceType: "ai-generated",
      academyStudyId: study.id,
      academyContentId: content.id,
      academyMaterialKind: materialKind(kind),
      tags: ["Academy", academyLabels.exportKinds[kind]],
    };
    await MaterialService.upsert(material);

    const markdown = academyContentToMarkdown(content);
    const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
    const extracted: ExtractedContent = {
      id: `academy-export-content-${content.id}-${kind}`,
      studyId: study.id,
      fileId: materialId,
      fileType: artifactFormat,
      extractedText: markdown,
      sections: content.chapters.flatMap((chapter) => [
        { type: "heading" as const, text: chapter.title, level: 1 },
        { type: "paragraph" as const, text: chapter.content },
        ...chapter.examples.map((example) => ({ type: "paragraph" as const, text: `Exemplo: ${example}` })),
      ]),
      metadata: {
        name: artifact.fileName,
        type: file.type,
        size: file.size,
        title: content.title,
        subject: study.subject,
        topic: study.topic,
        subtopics: content.modules.map((module) => module.title),
        keywords: content.concepts.map((concept) => concept.name),
        summaryPreview: content.summary.slice(0, 500),
        pageCount: artifact.pageCount ?? artifact.slideCount,
        language: study.language,
        wordCount,
        readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 220)),
        chapters: chapters(content),
        analysisStatus: "analyzed",
        analyzedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      stages: stages(now),
      logs: [{ id: `academy-export-log-${content.id}-${kind}`, stage: "indexed", status: "completed", message: `${academyLabels.exportKinds[kind]} indexado a partir do conteúdo estruturado.`, createdAt: now }],
      status: "extracted",
      createdAt: now,
    };
    await ContentStorage.upsert(extracted);
    const knowledge = await KnowledgeService.process(extracted);
    const chunks = knowledge.graph.chunks.length ? knowledge.graph.chunks : ChunkService.createChunks(extracted);
    await ChunkStorage.replaceForContent(extracted.id, chunks);
    await EmbeddingStorage.synchronize((await ChunkStorage.load()).chunks);

    const records = await StudyEngine.load();
    await StudyEngine.save(records.map((record) => record.studyId === study.id ? {
      ...record,
      materialIds: Array.from(new Set([...record.materialIds, materialId])),
      updatedAt: now,
      lastAccessedAt: now,
    } : record));

    const exportRecord: AcademyExportRecord = {
      id: materialId,
      contentId: content.id,
      materialId,
      kind,
      format: artifactFormat,
      fileName: artifact.fileName,
      size: file.size,
      pageCount: artifact.pageCount,
      slideCount: artifact.slideCount,
      persistentBinary,
      diagramMode: "mermaid-source",
      createdAt: now,
    };
    const updatedStudy: AcademyStudy = {
      ...study,
      exports: [exportRecord, ...study.exports.filter((item) => item.id !== exportRecord.id)],
      updatedAt: now,
    };
    await AcademyStorage.put(updatedStudy);
    return { study: updatedStudy, material, extracted, chunks, knowledge: knowledge.graph, exportRecord };
  },
};
