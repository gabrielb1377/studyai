import type { ExtractedContent } from "../extraction/ExtractionTypes";
import { ContentStorage } from "../extraction/ContentStorage";
import { ChunkService } from "../retrieval/ChunkService";
import { ChunkStorage } from "../retrieval/ChunkStorage";
import { EmbeddingStorage } from "../retrieval/EmbeddingStorage";
import { KnowledgeService } from "../semantic/KnowledgeService";
import { pagesMetadata, pagesToText, sectionsFromPages } from "./structure";

export type ReindexResult = {
  content: ExtractedContent;
  chunks: number;
  concepts: number;
  relations: number;
  embeddings: number;
};

export const ReindexService = {
  async rebuild(record: ExtractedContent, options: { persist?: boolean } = {}): Promise<ReindexResult> {
    let content = record;
    if (content.pages?.length) {
      content = {
        ...content,
        extractedText: pagesToText(content.pages),
        sections: sectionsFromPages(content.pages, {
          slideMode: content.fileType === "pptx",
          fallbackTitle: content.metadata.title,
        }),
        metadata: { ...content.metadata, ...pagesMetadata(content.pages, content.pipeline) },
      };
    }

    const knowledge = await KnowledgeService.process(content).catch(() => null);
    const chunks = knowledge?.graph.chunks.length
      ? knowledge.graph.chunks
      : ChunkService.createChunks(content);
    await ChunkStorage.replaceForContent(content.id, chunks);
    const embeddings = await EmbeddingStorage.synchronize((await ChunkStorage.load()).chunks);
    if (options.persist !== false) await ContentStorage.upsert(content);

    return {
      content,
      chunks: chunks.length,
      concepts: knowledge?.graph.statistics.conceptCount ?? 0,
      relations: knowledge?.graph.statistics.relationCount ?? 0,
      embeddings: embeddings.embeddings.length,
    };
  },
};
