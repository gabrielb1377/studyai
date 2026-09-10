import { ContentStorage } from "@/features/extraction/ContentStorage";
import { ChunkService } from "./ChunkService";
import { ChunkStorage } from "./ChunkStorage";
import { SearchService } from "./SearchService";
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
  retrieve(question: string, options: RetrievalOptions = {}): RetrievalResult {
    const chunks = SearchService.search(question, ensureChunksAreIndexed(), options);
    return { question, chunks, hasContext: chunks.length > 0 };
  },
};
