import { EmbeddingService } from "./EmbeddingService";
import type { ChunkEmbedding, SemanticSearchResult } from "./EmbeddingTypes";
import type { ContentChunk } from "./RetrievalTypes";

const MINIMUM_SIMILARITY = 0.12;

export const SemanticSearchService = {
  search(
    question: string,
    chunks: readonly ContentChunk[],
    embeddings: readonly ChunkEmbedding[],
    options: { studyId?: string; limit?: number } = {},
  ): SemanticSearchResult[] {
    const questionEmbedding = EmbeddingService.generate(question);
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    return embeddings
      .map((embedding) => {
        const chunk = chunksById.get(embedding.chunkId);
        if (!chunk || (options.studyId && chunk.studyId !== options.studyId)) return null;
        const similarity = EmbeddingService.cosineSimilarity(
          questionEmbedding,
          EmbeddingService.decode(embedding.embedding),
        );
        return similarity >= MINIMUM_SIMILARITY
          ? { chunk, similarity } satisfies SemanticSearchResult
          : null;
      })
      .filter((result): result is SemanticSearchResult => result !== null)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, options.limit ?? 20);
  },
};
