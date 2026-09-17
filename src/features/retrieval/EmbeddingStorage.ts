import { StorageManager } from "@/lib/storage/StorageManager";
import { EmbeddingService } from "./EmbeddingService";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  type ChunkEmbedding,
  type EmbeddingIndexStatus,
  type EmbeddingStore,
} from "./EmbeddingTypes";
import type { ContentChunk } from "./RetrievalTypes";

export const EMBEDDINGS_UPDATE_EVENT = "studyai:embeddings-updated";
const INDEX_METADATA_KEY = "embedding-index";
const EMPTY_STORE: EmbeddingStore = {
  version: 2,
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  encoding: "int8-base64",
  status: "idle",
  embeddings: [],
};

type IndexMetadata = {
  key: typeof INDEX_METADATA_KEY;
  value: Pick<EmbeddingStore, "status" | "lastIndexedAt" | "error">;
  updatedAt: string;
};

function isStatus(value: unknown): value is EmbeddingIndexStatus {
  return value === "idle" || value === "indexing" || value === "ready" || value === "error";
}

function normalizeEmbedding(value: unknown): ChunkEmbedding | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.chunkId !== "string" || typeof item.studyId !== "string" || typeof item.createdAt !== "string") return null;
  if (typeof item.embedding === "string") return item as unknown as ChunkEmbedding;
  if (Array.isArray(item.embedding) && item.embedding.length === EMBEDDING_DIMENSIONS &&
      item.embedding.every((number) => typeof number === "number" && Number.isFinite(number))) {
    return { ...item, embedding: EmbeddingService.encode(item.embedding) } as unknown as ChunkEmbedding;
  }
  return null;
}

function emitUpdate() {
  window.dispatchEvent(new Event(EMBEDDINGS_UPDATE_EVENT));
}

async function saveError(embeddings: readonly ChunkEmbedding[], error: unknown) {
  try {
    await EmbeddingStorage.save({
      ...EMPTY_STORE,
      status: "error",
      embeddings: [...embeddings],
      error: error instanceof Error ? error.message : "Falha ao gerar embeddings locais.",
    });
  } catch {
    // A recuperação lexical continua disponível mesmo se o banco local estiver indisponível.
  }
}

export const EmbeddingStorage = {
  async load(): Promise<EmbeddingStore> {
    const [values, metadata] = await Promise.all([
      StorageManager.getAll<unknown>("embeddings"),
      StorageManager.get<IndexMetadata>("metadata", INDEX_METADATA_KEY),
    ]);
    const embeddings = values.map(normalizeEmbedding).filter((value): value is ChunkEmbedding => value !== null);
    const state = metadata?.value;
    return {
      ...EMPTY_STORE,
      embeddings,
      status: isStatus(state?.status) ? state.status : embeddings.length > 0 ? "ready" : "idle",
      lastIndexedAt: typeof state?.lastIndexedAt === "string" ? state.lastIndexedAt : undefined,
      error: typeof state?.error === "string" ? state.error : undefined,
    };
  },

  async save(store: EmbeddingStore) {
    await StorageManager.transaction(["embeddings", "metadata"], async (storage) => {
      await storage.clear("embeddings");
      for (const embedding of store.embeddings) await storage.put("embeddings", embedding);
      await storage.put("metadata", {
        key: INDEX_METADATA_KEY,
        value: { status: store.status, lastIndexedAt: store.lastIndexedAt, error: store.error },
        updatedAt: new Date().toISOString(),
      } satisfies IndexMetadata);
    });
    emitUpdate();
  },

  async synchronize(chunks: readonly ContentChunk[]) {
    const current = await this.load();
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const retained = current.embeddings
      .filter((embedding) => chunksById.has(embedding.chunkId))
      .map((embedding) => ({
        ...embedding,
        studyId: chunksById.get(embedding.chunkId)?.studyId ?? embedding.studyId,
      }));
    const indexedIds = new Set(retained.map((embedding) => embedding.chunkId));
    const pending = chunks.filter((chunk) => !indexedIds.has(chunk.id));
    const indexChanged = retained.length !== current.embeddings.length || retained.some(
      (embedding, index) => embedding.studyId !== current.embeddings[index]?.studyId,
    );

    if (chunks.length === 0) {
      if (current.status !== "idle" || current.embeddings.length > 0) await this.save(EMPTY_STORE);
      return EMPTY_STORE;
    }
    if (pending.length === 0 && !indexChanged && current.status === "ready") return current;

    try {
      await this.save({ ...EMPTY_STORE, status: "indexing", embeddings: retained, lastIndexedAt: current.lastIndexedAt });
      const indexedAt = new Date().toISOString();
      const store: EmbeddingStore = {
        ...EMPTY_STORE,
        status: "ready",
        embeddings: [...retained, ...pending.map((chunk) => EmbeddingService.generateForChunk(chunk, indexedAt))],
        lastIndexedAt: indexedAt,
      };
      await this.save(store);
      return store;
    } catch (error) {
      await saveError(retained, error);
      throw error;
    }
  },
};
