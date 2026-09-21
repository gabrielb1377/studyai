import { extractionFileTypes } from "@/features/extraction/ExtractionTypes";
import { StorageManager } from "@/lib/storage/StorageManager";
import type { ChunkMetadata, ChunkStore, ContentChunk } from "./RetrievalTypes";

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
    isOptionalString(metadata.language) && isOptionalString(metadata.title) &&
    isOptionalString(metadata.subject) && isOptionalString(metadata.topic) &&
    (metadata.keywords === undefined || (
      Array.isArray(metadata.keywords) && metadata.keywords.every((keyword) => typeof keyword === "string")
    )) && (metadata.semanticType === undefined || metadata.semanticType === "semantic") &&
    (metadata.conceptIds === undefined || (Array.isArray(metadata.conceptIds) && metadata.conceptIds.every((id) => typeof id === "string"))) &&
    (metadata.relationIds === undefined || (Array.isArray(metadata.relationIds) && metadata.relationIds.every((id) => typeof id === "string"))) &&
    isOptionalString(metadata.chapter) && isOptionalString(metadata.section);
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
  async load(): Promise<ChunkStore> {
    const chunks = await StorageManager.getAll<unknown>("chunks");
    const store = { version: 1 as const, chunks };
    return isChunkStore(store) ? store : EMPTY_STORE;
  },

  async save(store: ChunkStore) {
    await StorageManager.replaceAll("chunks", store.chunks);
    window.dispatchEvent(new Event(CHUNKS_UPDATE_EVENT));
  },

  async replaceForContent(extractedContentId: string, chunks: readonly ContentChunk[]) {
    const current = (await this.load()).chunks.filter(
      (chunk) => chunk.metadata.extractedContentId !== extractedContentId,
    );
    await this.save({ version: 1, chunks: [...current, ...chunks] });
  },

  async updateFile(fileId: string, changes: { studyId?: string; sourceName?: string }) {
    const chunks = (await this.load()).chunks.map((chunk) => chunk.fileId === fileId
      ? {
          ...chunk,
          ...(changes.studyId ? { studyId: changes.studyId } : {}),
          metadata: changes.sourceName
            ? { ...chunk.metadata, sourceName: changes.sourceName }
            : chunk.metadata,
        }
      : chunk,
    );
    await this.save({ version: 1, chunks });
  },

  async removeByFileId(fileId: string) {
    const chunks = (await this.load()).chunks.filter((chunk) => chunk.fileId !== fileId);
    await this.save({ version: 1, chunks });
  },
};
