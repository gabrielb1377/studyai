import { extractionFileTypes } from "@/features/extraction/ExtractionTypes";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import type { ChunkMetadata, ChunkStore, ContentChunk } from "./RetrievalTypes";

const STORAGE_KEY = "studyai:content-chunks";
export const CHUNKS_UPDATE_EVENT = "studyai:content-chunks-updated";
const EMPTY_STORE: ChunkStore = { version: 1, chunks: [] };

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isChunkMetadata(value: unknown): value is ChunkMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<ChunkMetadata>;
  return typeof metadata.extractedContentId === "string" &&
    typeof metadata.sourceName === "string" &&
    extractionFileTypes.includes(metadata.fileType as typeof extractionFileTypes[number]) &&
    typeof metadata.mimeType === "string" && typeof metadata.size === "number" &&
    isOptionalNumber(metadata.pageCount) && isOptionalNumber(metadata.duration) &&
    isOptionalString(metadata.language);
}

function isContentChunk(value: unknown): value is ContentChunk {
  if (typeof value !== "object" || value === null) return false;
  const chunk = value as Partial<ContentChunk>;
  return typeof chunk.id === "string" && typeof chunk.studyId === "string" &&
    typeof chunk.fileId === "string" && typeof chunk.chunkIndex === "number" &&
    Number.isInteger(chunk.chunkIndex) && chunk.chunkIndex >= 0 &&
    typeof chunk.text === "string" && chunk.text.length > 0 &&
    isChunkMetadata(chunk.metadata);
}

function isChunkStore(value: unknown): value is ChunkStore {
  if (typeof value !== "object" || value === null) return false;
  const store = value as Partial<ChunkStore>;
  return store.version === 1 && Array.isArray(store.chunks) &&
    store.chunks.every(isContentChunk);
}

export const ChunkStorage = {
  load(): ChunkStore {
    return readLocalStorage(STORAGE_KEY, isChunkStore) ?? EMPTY_STORE;
  },

  save(store: ChunkStore) {
    writeLocalStorage(STORAGE_KEY, store, CHUNKS_UPDATE_EVENT);
  },

  replaceForContent(extractedContentId: string, chunks: readonly ContentChunk[]) {
    const current = this.load().chunks.filter(
      (chunk) => chunk.metadata.extractedContentId !== extractedContentId,
    );
    this.save({ version: 1, chunks: [...current, ...chunks] });
  },
};
