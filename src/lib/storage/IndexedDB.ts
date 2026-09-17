import { openStudyDatabase } from "./Database";
import type { StorageStoreName } from "./StorageVersion";

export type StorageTransaction = {
  get<T>(store: StorageStoreName, key: IDBValidKey): Promise<T | undefined>;
  getAll<T>(store: StorageStoreName): Promise<T[]>;
  count(store: StorageStoreName): Promise<number>;
  page<T>(store: StorageStoreName, offset: number, limit: number): Promise<T[]>;
  put<T>(store: StorageStoreName, value: T): Promise<IDBValidKey>;
  delete(store: StorageStoreName, key: IDBValidKey): Promise<void>;
  clear(store: StorageStoreName): Promise<void>;
};

function requestAsPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("A operação no banco local falhou."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("A transação foi revertida."));
    transaction.onerror = () => reject(transaction.error ?? new Error("A transação falhou."));
  });
}

function createTransactionApi(transaction: IDBTransaction): StorageTransaction {
  return {
    get: <T>(store: StorageStoreName, key: IDBValidKey) => requestAsPromise(
      transaction.objectStore(store).get(key) as IDBRequest<T | undefined>,
    ),
    getAll: <T>(store: StorageStoreName) => requestAsPromise(
      transaction.objectStore(store).getAll() as IDBRequest<T[]>,
    ),
    count: (store: StorageStoreName) => requestAsPromise(transaction.objectStore(store).count()),
    page: <T>(store: StorageStoreName, offset: number, limit: number) => new Promise<T[]>((resolve, reject) => {
      const values: T[] = [];
      const request = transaction.objectStore(store).openCursor();
      let skipped = false;
      request.onerror = () => reject(request.error ?? new Error("Não foi possível paginar os registros."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || values.length >= limit) {
          resolve(values);
          return;
        }
        if (offset > 0 && !skipped) {
          skipped = true;
          cursor.advance(offset);
          return;
        }
        values.push(cursor.value as T);
        cursor.continue();
      };
    }),
    put: <T>(store: StorageStoreName, value: T) => requestAsPromise(transaction.objectStore(store).put(value)),
    delete: async (store: StorageStoreName, key: IDBValidKey) => {
      await requestAsPromise(transaction.objectStore(store).delete(key));
    },
    clear: async (store: StorageStoreName) => {
      await requestAsPromise(transaction.objectStore(store).clear());
    },
  };
}

export const IndexedDB = {
  async transaction<T>(
    stores: readonly StorageStoreName[],
    mode: IDBTransactionMode,
    operation: (storage: StorageTransaction) => Promise<T>,
  ) {
    const database = await openStudyDatabase();
    const transaction = database.transaction([...stores], mode);
    const completion = transactionDone(transaction);
    try {
      const result = await operation(createTransactionApi(transaction));
      await completion;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // A transação já pode ter sido finalizada pelo navegador.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  },
};
