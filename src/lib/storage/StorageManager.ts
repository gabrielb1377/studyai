import { IndexedDB, type StorageTransaction } from "./IndexedDB";
import { Migration } from "./Migration";
import {
  STORAGE_DATABASE_NAME,
  STORAGE_DATABASE_VERSION,
  STORAGE_MIGRATION_KEY,
  STORAGE_STORES,
  type StorageStoreName,
} from "./StorageVersion";

export const STORAGE_UPDATED_EVENT = "studyai:storage-updated";

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: "UNAVAILABLE" | "FULL" | "TRANSACTION" | "UNKNOWN",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}

let initialization: Promise<void> | undefined;

function normalizeError(error: unknown) {
  if (error instanceof StorageError) return error;
  const domError = error instanceof DOMException ? error : undefined;
  if (domError?.name === "QuotaExceededError") {
    return new StorageError(
      "O armazenamento local está cheio. Remova materiais antigos ou libere espaço no navegador.",
      "FULL",
      { cause: error },
    );
  }
  if (domError?.name === "InvalidStateError" || domError?.name === "NotSupportedError") {
    return new StorageError("O armazenamento local não está disponível neste navegador.", "UNAVAILABLE", { cause: error });
  }
  return new StorageError(
    error instanceof Error ? error.message : "Não foi possível concluir a operação no armazenamento local.",
    "UNKNOWN",
    { cause: error },
  );
}

function emit(store: StorageStoreName, key?: IDBValidKey) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { store, key } }));
  }
}

function valueKey(value: unknown): IDBValidKey | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const key = record.id ?? record.studyId ?? record.chunkId ?? record.key;
  return typeof key === "string" || typeof key === "number" ? key : undefined;
}

async function ready() {
  if (typeof window === "undefined") return;
  initialization ??= Migration.run().catch((error) => {
    initialization = undefined;
    throw normalizeError(error);
  });
  await initialization;
}

export type StorageDiagnostics = {
  database: string;
  version: number;
  counts: Record<StorageStoreName, number>;
  usageBytes?: number;
  quotaBytes?: number;
  lastMigration?: string;
};

export const StorageManager = {
  initialize: ready,

  async get<T>(store: StorageStoreName, key: IDBValidKey) {
    await ready();
    try {
      return await IndexedDB.transaction([store], "readonly", (storage) => storage.get<T>(store, key));
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getAll<T>(store: StorageStoreName) {
    await ready();
    try {
      return await IndexedDB.transaction([store], "readonly", (storage) => storage.getAll<T>(store));
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async put<T>(store: StorageStoreName, value: T, options: { notify?: boolean } = {}) {
    await ready();
    try {
      const key = await IndexedDB.transaction([store], "readwrite", (storage) => storage.put(store, value));
      if (options.notify !== false) emit(store, valueKey(value));
      return key;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async putMany<T>(store: StorageStoreName, values: readonly T[]) {
    await ready();
    try {
      await IndexedDB.transaction([store], "readwrite", async (storage) => {
        for (const value of values) await storage.put(store, value);
      });
      emit(store);
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async replaceAll<T>(store: StorageStoreName, values: readonly T[]) {
    await ready();
    try {
      await IndexedDB.transaction([store], "readwrite", async (storage) => {
        await storage.clear(store);
        for (const value of values) await storage.put(store, value);
      });
      emit(store);
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async delete(store: StorageStoreName, key: IDBValidKey) {
    await ready();
    try {
      await IndexedDB.transaction([store], "readwrite", (storage) => storage.delete(store, key));
      emit(store);
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async transaction<T>(
    stores: readonly StorageStoreName[],
    operation: (storage: StorageTransaction) => Promise<T>,
  ) {
    await ready();
    try {
      const result = await IndexedDB.transaction(stores, "readwrite", operation);
      stores.forEach(emit);
      return result;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async paginate<T>(store: StorageStoreName, page: number, pageSize: number) {
    await ready();
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.max(1, Math.floor(pageSize));
    const start = (safePage - 1) * safeSize;
    try {
      const [items, total] = await IndexedDB.transaction([store], "readonly", (storage) => Promise.all([
        storage.page<T>(store, start, safeSize),
        storage.count(store),
      ]));
      return { items, total, page: safePage, pageSize: safeSize };
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async diagnostics(): Promise<StorageDiagnostics> {
    await ready();
    const counts = Object.fromEntries(await Promise.all(STORAGE_STORES.map(async (store) => [
      store,
      await IndexedDB.transaction([store], "readonly", (storage) => storage.count(store)),
    ]))) as Record<StorageStoreName, number>;
    const migration = await this.get<{ key: string; value: number; updatedAt: string }>("metadata", STORAGE_MIGRATION_KEY);
    const estimate = typeof navigator !== "undefined" && navigator.storage?.estimate
      ? await navigator.storage.estimate().catch(() => undefined)
      : undefined;
    return {
      database: STORAGE_DATABASE_NAME,
      version: STORAGE_DATABASE_VERSION,
      counts,
      usageBytes: estimate?.usage,
      quotaBytes: estimate?.quota,
      lastMigration: migration?.updatedAt,
    };
  },
};
