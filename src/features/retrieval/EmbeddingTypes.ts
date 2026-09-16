import type { ContentChunk } from "./RetrievalTypes";

export const EMBEDDING_MODEL = "local-feature-hash-v1";
export const EMBEDDING_DIMENSIONS = 192;

export type EmbeddingIndexStatus = "idle" | "indexing" | "ready" | "error";

export type ChunkEmbedding = {
  chunkId: string;
  studyId: string;
  embedding: string;
  createdAt: string;
};

export type EmbeddingStore = {
  version: 2;
  model: typeof EMBEDDING_MODEL;
  dimensions: typeof EMBEDDING_DIMENSIONS;
  encoding: "int8-base64";
  status: EmbeddingIndexStatus;
  embeddings: ChunkEmbedding[];
  lastIndexedAt?: string;
  error?: string;
};

export type SemanticSearchResult = {
  chunk: ContentChunk;
  similarity: number;
};

export type HybridRanking = {
  semanticSimilarity: number;
  semanticScore: number;
  lexicalScore: number;
  studyScore: number;
  fileNameScore: number;
  frequencyScore: number;
};
