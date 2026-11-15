import { ChunkService } from "@/features/retrieval/ChunkService";
import { ChunkStorage } from "@/features/retrieval/ChunkStorage";
import { EmbeddingStorage } from "@/features/retrieval/EmbeddingStorage";
import { KnowledgeService } from "@/features/semantic/KnowledgeService";
import { StudyGeneratorService } from "@/features/study-generator/services/StudyGeneratorService";
import { MaterialService } from "@/services/material-service";
import { ContentStorage } from "./ContentStorage";
import type { ExtractedContent, ExtractionFileType } from "./ExtractionTypes";
import { parseSubtitleOrTranscript } from "./media-validation";

export const MediaTranscriptService = {
  async saveManualOrSubtitle(input: {
    fileId: string;
    studyId: string;
    rawText: string;
    duration?: number;
  }): Promise<ExtractedContent> {
    const parsed = parseSubtitleOrTranscript(input.rawText, input.duration);
    const [store, material] = await Promise.all([
      ContentStorage.load(),
      MaterialService.findById(input.fileId),
    ]);
    const existing = store.records.find((item) => item.fileId === input.fileId);
    const now = new Date().toISOString();

    const baseRecord: ExtractedContent = existing ?? {
      id: `extraction-${input.fileId}`,
      studyId: input.studyId,
      fileId: input.fileId,
      fileType: (material?.fileType ?? "mp4") as ExtractionFileType,
      extractedText: "",
      metadata: {
        name: material?.name ?? "Mídia",
        type: material?.mimeType ?? "application/octet-stream",
        size: material?.size ?? 0,
        duration: input.duration,
        createdAt: now,
        updatedAt: now,
      },
      status: "extracted",
      createdAt: now,
    };

    const withTranscript: ExtractedContent = {
      ...baseRecord,
      studyId: input.studyId,
      extractedText: parsed.text,
      sections: parsed.chapters.map((chapter) => ({
        type: "heading" as const,
        text: chapter.title,
      })),
      transcription: {
        segments: parsed.segments,
        chapters: parsed.chapters,
      },
      metadata: {
        ...baseRecord.metadata,
        duration: baseRecord.metadata.duration ?? input.duration,
        transcriptionPerformed: true,
        transcriptionSource: parsed.source,
        transcriptionModel: parsed.source === "subtitle" ? "subtitle-import" : "manual-transcript",
        updatedAt: now,
      },
      status: "extracted",
      error: undefined,
    };

    const generated = await StudyGeneratorService.generate(withTranscript, material);
    const updatedRecord: ExtractedContent = {
      ...generated.record,
      extractedText: parsed.text,
      sections: withTranscript.sections,
      transcription: withTranscript.transcription,
      metadata: {
        ...generated.record.metadata,
        transcriptionPerformed: true,
        transcriptionSource: parsed.source,
        transcriptionModel: parsed.source === "subtitle" ? "subtitle-import" : "manual-transcript",
        updatedAt: now,
      },
    };

    let chunks = ChunkService.createChunks(updatedRecord);
    try {
      const knowledge = await KnowledgeService.process(updatedRecord);
      if (knowledge.graph.chunks.length > 0) chunks = knowledge.graph.chunks;
    } catch {
      // Fallback para chunking convencional já criado acima.
    }
    await ChunkStorage.replaceForContent(updatedRecord.id, chunks);
    await EmbeddingStorage.synchronize((await ChunkStorage.load()).chunks).catch(() => undefined);
    await ContentStorage.upsert(updatedRecord);
    return updatedRecord;
  },
};
