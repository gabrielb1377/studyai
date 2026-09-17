import {
  STORAGE_DATABASE_NAME,
  STORAGE_DATABASE_VERSION,
  STORAGE_STORES,
  type StorageStoreName,
} from "./StorageVersion";

const storeDefinitions: Record<StorageStoreName, { keyPath: string; indexes?: Array<[string, string]> }> = {
  documents: { keyPath: "id", indexes: [["studyId", "studyId"], ["status", "status"]] },
  contents: { keyPath: "id", indexes: [["fileId", "fileId"], ["studyId", "studyId"], ["status", "status"]] },
  chunks: { keyPath: "id", indexes: [["fileId", "fileId"], ["studyId", "studyId"], ["extractedContentId", "metadata.extractedContentId"]] },
  embeddings: { keyPath: "chunkId", indexes: [["studyId", "studyId"]] },
  studies: { keyPath: "studyId", indexes: [["lastAccessedAt", "lastAccessedAt"]] },
  notes: { keyPath: "id", indexes: [["studyId", "studyId"]] },
  summaries: { keyPath: "id", indexes: [["studyId", "studyId"]] },
  flashcards: { keyPath: "id", indexes: [["studyId", "studyId"]] },
  quizzes: { keyPath: "id", indexes: [["studyId", "studyId"], ["kind", "kind"]] },
  transcriptions: { keyPath: "id", indexes: [["fileId", "fileId"], ["studyId", "studyId"]] },
  ocr: { keyPath: "id", indexes: [["fileId", "fileId"], ["studyId", "studyId"]] },
  metadata: { keyPath: "key" },
};

let databasePromise: Promise<IDBDatabase> | undefined;

export function openStudyDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("O IndexedDB não está disponível neste navegador."));
  }
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DATABASE_NAME, STORAGE_DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o banco local."));
    request.onblocked = () => reject(new Error("O banco local está bloqueado por outra aba. Feche outras abas do StudyAI e tente novamente."));
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of STORAGE_STORES) {
        const definition = storeDefinitions[name];
        const store = database.objectStoreNames.contains(name)
          ? request.transaction?.objectStore(name)
          : database.createObjectStore(name, { keyPath: definition.keyPath });
        if (!store) continue;
        for (const [indexName, keyPath] of definition.indexes ?? []) {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
        }
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
  }).catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

export function resetDatabaseConnection() {
  databasePromise = undefined;
}
