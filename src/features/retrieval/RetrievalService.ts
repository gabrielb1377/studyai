import { ContentStorage } from "@/features/extraction/ContentStorage";
import { ChunkService } from "./ChunkService";
import { ChunkStorage } from "./ChunkStorage";
import { EmbeddingStorage } from "./EmbeddingStorage";
import { RankingService } from "./RankingService";
import { SearchService } from "./SearchService";
import { SemanticSearchService } from "./SemanticSearchService";
import type { RetrievalOptions, RetrievalResult } from "./RetrievalTypes";

function ensureChunksAreIndexed() {
  const store = ChunkStorage.load();
  const indexedContentIds = new Set(
    store.chunks.map((chunk) => chunk.metadata.extractedContentId),
  );
  let chunks = store.chunks;
  let changed = false;

  for (const content of ContentStorage.load().records) {
    if (content.status !== "extracted" || !content.extractedText.trim() ||
      indexedContentIds.has(content.id)) continue;

    chunks = [...chunks, ...ChunkService.createChunks(content)];
    indexedContentIds.add(content.id);
    changed = true;
  }

  if (changed) ChunkStorage.save({ version: 1, chunks });
  return chunks;
}

export const RetrievalService = {
  forStudy(studyId: string, limit = 12) {
    const chunks = ensureChunksAreIndexed()
      .filter((chunk) => chunk.studyId === studyId)
      .sort((a, b) => a.fileId.localeCompare(b.fileId) || a.chunkIndex - b.chunkIndex)
      .slice(0, limit)
      .map((chunk, index) => ({
        ...chunk,
        score: Math.max(1, 100 - index),
        matchedTerms: [],
      }));

    return {
      question: "Conteúdo integral do estudo",
      chunks,
      hasContext: chunks.length > 0,
      strategy: "lexical" as const,
    };
  },

  retrieve(question: string, options: RetrievalOptions = {}): RetrievalResult {
    const sourceChunks = ensureChunksAreIndexed();
    const candidateLimit = Math.max((options.limit ?? 5) * 4, 20);
    const lexicalChunks = SearchService.search(question, sourceChunks, {
      ...options,
      limit: candidateLimit,
    });

    try {
      const embeddings = EmbeddingStorage.synchronize(sourceChunks).embeddings;
      const semanticChunks = SemanticSearchService.search(
        question,
        sourceChunks,
        embeddings,
        { ...options, limit: candidateLimit },
      );
      const chunks = RankingService.rank(
        question,
        sourceChunks,
        semanticChunks,
        lexicalChunks,
        options,
      );
      return { question, chunks, hasContext: chunks.length > 0, strategy: "hybrid" };
    } catch {
      const chunks = lexicalChunks.slice(0, options.limit ?? 5);
      return {
        question,
        chunks,
        hasContext: chunks.length > 0,
        strategy: "lexical",
        warning: "A busca semântica falhou; o ranking lexical foi utilizado.",
      };
    }
  },
};
