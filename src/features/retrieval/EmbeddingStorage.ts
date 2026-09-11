import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { EmbeddingService } from "./EmbeddingService";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  type ChunkEmbedding,
  type EmbeddingIndexStatus,
  type EmbeddingStore,
} from "./EmbeddingTypes";
import type { ContentChunk } from "./RetrievalTypes";

const STORAGE_KEY = "studyai:embeddings";
export const EMBEDDINGS_UPDATE_EVENT = "studyai:embeddings-updated";
const EMPTY_STORE: EmbeddingStore = {
  version: 1,
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  status: "idle",
  embeddings: [],
};

function isStatus(value: unknown): value is EmbeddingIndexStatus {
  return value === "idle" || value === "indexing" || value === "ready" || value === "error";
}

function isEmbedding(value: unknown): value is ChunkEmbedding {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<ChunkEmbedding>;
  return typeof item.chunkId === "string" && typeof item.studyId === "string" &&
    typeof item.createdAt === "string" && Array.isArray(item.embedding) &&
    item.embedding.length === EMBEDDING_DIMENSIONS &&
    item.embedding.every((number) => typeof number === "number" && Number.isFinite(number));
}

function isEmbeddingStore(value: unknown): value is EmbeddingStore {
  if (typeof value !== "object" || value === null) return false;
  const store = value as Partial<EmbeddingStore>;
  return store.version === 1 && store.model === EMBEDDING_MODEL &&
    store.dimensions === EMBEDDING_DIMENSIONS && isStatus(store.status) &&
    Array.isArray(store.embeddings) && store.embeddings.every(isEmbedding) &&
    (store.lastIndexedAt === undefined || typeof store.lastIndexedAt === "string") &&
    (store.error === undefined || typeof store.error === "string");
}

function saveError(embeddings: readonly ChunkEmbedding[], error: unknown) {
  try {
    writeLocalStorage(STORAGE_KEY, {
      ...EMPTY_STORE,
      status: "error",
      embeddings: [...embeddings],
      error: error instanceof Error ? error.message : "Falha ao gerar embeddings locais.",
    }, EMBEDDINGS_UPDATE_EVENT);
  } catch {
    // O fallback lexical continua disponível mesmo se o localStorage estiver indisponível.
  }
}

export const EmbeddingStorage = {
  load(): EmbeddingStore {
    return readLocalStorage(STORAGE_KEY, isEmbeddingStore) ?? EMPTY_STORE;
  },

  save(store: EmbeddingStore) {
    writeLocalStorage(STORAGE_KEY, store, EMBEDDINGS_UPDATE_EVENT);
  },

  synchronize(chunks: readonly ContentChunk[]) {
    const current = this.load();
    const chunkIds = new Set(chunks.map((chunk) => chunk.id));
    const retained = current.embeddings.filter((embedding) => chunkIds.has(embedding.chunkId));
    const indexedIds = new Set(retained.map((embedding) => embedding.chunkId));
    const pending = chunks.filter((chunk) => !indexedIds.has(chunk.id));
    const removedStaleEmbeddings = retained.length !== current.embeddings.length;

    if (chunks.length === 0) {
      if (current.status !== "idle" || current.embeddings.length > 0) this.save(EMPTY_STORE);
      return EMPTY_STORE;
    }
    if (pending.length === 0 && !removedStaleEmbeddings && current.status === "ready") {
      return current;
    }

    try {
      this.save({
        ...EMPTY_STORE,
        status: "indexing",
        embeddings: retained,
        lastIndexedAt: current.lastIndexedAt,
      });
      const indexedAt = new Date().toISOString();
      const store: EmbeddingStore = {
        ...EMPTY_STORE,
        status: "ready",
        embeddings: [
          ...retained,
          ...pending.map((chunk) => EmbeddingService.generateForChunk(chunk, indexedAt)),
        ],
        lastIndexedAt: indexedAt,
      };
      this.save(store);
      return store;
    } catch (error) {
      saveError(retained, error);
      throw error;
    }
  },
};
