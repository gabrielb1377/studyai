import type { ExtractionFileType } from "@/features/extraction/ExtractionTypes";
import type { KnowledgeContext } from "@/features/semantic/types";

export type ChunkMetadata = {
  extractedContentId: string;
  sourceName: string;
  fileType: ExtractionFileType;
  mimeType: string;
  size: number;
  pageCount?: number;
  duration?: number;
  language?: string;
  title?: string;
  subject?: string;
  topic?: string;
  keywords?: string[];
  semanticType?: "semantic";
  conceptIds?: string[];
  relationIds?: string[];
  chapter?: string;
  section?: string;
};

export type ContentChunk = {
  id: string;
  studyId: string;
  fileId: string;
  chunkIndex: number;
  text: string;
  metadata: ChunkMetadata;
};

export type RetrievedChunk = ContentChunk & {
  score: number;
  matchedTerms: string[];
};

export type ChunkStore = {
  version: 1;
  chunks: ContentChunk[];
};

export type RetrievalOptions = {
  studyId?: string;
  limit?: number;
};

export type RetrievalResult = {
  question: string;
  chunks: RetrievedChunk[];
  hasContext: boolean;
  strategy: "hybrid" | "lexical";
  warning?: string;
  knowledge?: KnowledgeContext;
};
