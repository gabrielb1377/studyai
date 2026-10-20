import type { Page } from "@playwright/test";
import { STORAGE_DATABASE_VERSION } from "../../src/lib/storage/StorageVersion";

export async function readIndexedDBStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async ([name, version]) => new Promise<T[]>((resolve, reject) => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
    const request = indexedDB.open(databaseName, version as number);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(name as string, "readonly");
      const values = transaction.objectStore(name as string).getAll();
      values.onsuccess = () => resolve(values.result as T[]);
      values.onerror = () => reject(values.error);
      transaction.oncomplete = () => database.close();
    };
  }), [storeName, STORAGE_DATABASE_VERSION] as [string, number]);
}
