import { ContentStorage } from "@/features/extraction/ContentStorage";
import { ChunkService } from "./ChunkService";
import { ChunkStorage } from "./ChunkStorage";
import { EmbeddingStorage } from "./EmbeddingStorage";
import { RankingService } from "./RankingService";
import { SearchService } from "./SearchService";
import { SemanticSearchService } from "./SemanticSearchService";
import { KnowledgeService } from "@/features/semantic/KnowledgeService";
import { KnowledgeStorage } from "@/features/semantic/KnowledgeStorage";
import { SemanticSearchService as KnowledgeSearchService } from "@/features/semantic/SemanticSearchService";
import type { RetrievalOptions, RetrievalResult } from "./RetrievalTypes";

async function ensureChunksAreIndexed() {
  const store = await ChunkStorage.load();
  const indexedContentIds = new Set(
    store.chunks.map((chunk) => chunk.metadata.extractedContentId),
  );
  let chunks = store.chunks;
  let changed = false;

  for (const content of (await ContentStorage.load()).records) {
    if (content.status !== "extracted" || !content.extractedText.trim() ||
      indexedContentIds.has(content.id)) continue;

    const knowledge = await KnowledgeService.process(content).catch(() => null);
    chunks = [...chunks, ...(knowledge?.graph.chunks ?? ChunkService.createChunks(content))];
    indexedContentIds.add(content.id);
    changed = true;
  }

  if (changed) await ChunkStorage.save({ version: 1, chunks });
  return chunks;
}

export const RetrievalService = {
  async forStudy(studyId: string, limit = 12) {
    const chunks = (await ensureChunksAreIndexed())
      .filter((chunk) => chunk.studyId === studyId)
      .sort((a, b) => a.fileId.localeCompare(b.fileId) || a.chunkIndex - b.chunkIndex)
      .slice(0, limit)
      .map((chunk, index) => ({
        ...chunk,
        score: Math.max(1, 100 - index),
        matchedTerms: [],
      }));

    const graphs = await KnowledgeStorage.getByStudyId(studyId);
    const concepts = graphs.flatMap((graph) => graph.concepts).slice(0, 8).map((concept) => ({
      concept,
      graphId: `knowledge-${concept.fileId}`,
      score: concept.importance * 10,
      matchedBy: ["relation" as const],
      related: [],
    }));
    return {
      question: "Conteúdo integral do estudo",
      chunks,
      hasContext: chunks.length > 0,
      strategy: "lexical" as const,
      knowledge: {
        query: "Conteúdo integral do estudo",
        expandedQuery: concepts.map((match) => match.concept.name).join(" "),
        concepts,
        relationCount: graphs.reduce((total, graph) => total + graph.relations.length, 0),
        hasContext: concepts.length > 0,
      },
    };
  },

  async retrieve(question: string, options: RetrievalOptions = {}): Promise<RetrievalResult> {
    const sourceChunks = await ensureChunksAreIndexed();
    const knowledge = await KnowledgeSearchService.search(question, options).catch(() => undefined);
    const retrievalQuestion = knowledge?.hasContext ? knowledge.expandedQuery : question;
    const candidateLimit = Math.max((options.limit ?? 5) * 4, 20);
    const lexicalChunks = SearchService.search(retrievalQuestion, sourceChunks, {
      ...options,
      limit: candidateLimit,
    });

    try {
      const embeddings = (await EmbeddingStorage.synchronize(sourceChunks)).embeddings;
      const semanticChunks = SemanticSearchService.search(
        retrievalQuestion,
        sourceChunks,
        embeddings,
        { ...options, limit: candidateLimit },
      );
      const chunks = RankingService.rank(
        retrievalQuestion,
        sourceChunks,
        semanticChunks,
        lexicalChunks,
        options,
      );
      return { question, chunks, hasContext: chunks.length > 0, strategy: "hybrid", knowledge };
    } catch {
      const chunks = lexicalChunks.slice(0, options.limit ?? 5);
      return {
        question,
        chunks,
        hasContext: chunks.length > 0,
        strategy: "lexical",
        warning: "A busca semântica falhou; o ranking lexical foi utilizado.",
        knowledge,
      };
    }
  },
};
