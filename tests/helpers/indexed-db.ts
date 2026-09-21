import type { Page } from "@playwright/test";

export async function readIndexedDBStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async (name) => new Promise<T[]>((resolve, reject) => {
    const request = indexedDB.open("studyai-db", 2);
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
