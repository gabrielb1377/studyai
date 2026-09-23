import type { Page } from "@playwright/test";

export async function readIndexedDBStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async (name) => new Promise<T[]>((resolve, reject) => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
    const request = indexedDB.open(databaseName, 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(name, "readonly");
      const values = transaction.objectStore(name).getAll();
      values.onsuccess = () => resolve(values.result as T[]);
      values.onerror = () => reject(values.error);
      transaction.oncomplete = () => database.close();
    };
  }), storeName);
}
