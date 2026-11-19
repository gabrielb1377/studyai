import { AuthClient } from "@/features/account/AuthClient";
import { SessionChangedError, SessionOperationManager, type SessionOperation } from "@/features/account/SessionOperationManager";
import { StorageManager } from "@/lib/storage/StorageManager";
import { STORAGE_MIGRATION_KEY, type StorageStoreName } from "@/lib/storage/StorageVersion";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import type { Material } from "@/types/material";
import { CloudFileService } from "./CloudFileService";
import { applySyncPreferences, syncPreferences } from "./SyncPreferences";
import type { ClientCloudRecord, ClientConflict, ClientSyncEntity, SyncMetadata } from "./types";

const KEY = "cloud-sync:v1";
const stores = ["documents", "contents", "chunks", "embeddings", "studies", "notes", "summaries", "flashcards", "quizzes", "transcriptions", "ocr", "knowledge", "academy", "lab", "metadata", "studio-documents"] as const satisfies readonly StorageStoreName[];
let running: { userId: string; generation: number; promise: Promise<SyncMetadata> } | undefined;
let rerunRequested = false;
let handshakeRequested = false;

function empty(): SyncMetadata { return { key: KEY, state: { status: navigator.onLine ? "idle" : "offline", cursor: 0, pending: 0, uploadedBytes: 0 }, manifest: {}, queue: [], conflicts: [], fileManifest: {}, updatedAt: new Date().toISOString() }; }
function stable(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;return`{${Object.entries(value as Record<string,unknown>).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;}
async function digest(value: unknown) { const bytes = new TextEncoder().encode(stable(value)); return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((item) => item.toString(16).padStart(2, "0")).join(""); }
function idOf(record: unknown) { if (!record || typeof record !== "object") return; const value = record as Record<string, unknown>; return [value.id, value.studyId, value.chunkId, value.key].find((item): item is string => typeof item === "string"); }
function entityFor(store: StorageStoreName, id: string): ClientSyncEntity { if (store === "metadata" && id.startsWith("mentor:")) return "mentor"; if (store === "metadata" && id.startsWith("learning-")) return "learning"; return store; }
function localPreferences() { return syncPreferences(localStorage); }

async function loadMeta(operation?: SessionOperation) { operation?.assertCurrent(); const value = await StorageManager.get<SyncMetadata>("metadata", KEY) ?? empty(); operation?.assertCurrent(); return value; }
function emitSyncState(meta: SyncMetadata) { window.dispatchEvent(new CustomEvent("studyai:cloud-sync", { detail: meta.state })); }
async function saveMeta(meta: SyncMetadata, options: { notify?: boolean; operation?: SessionOperation } = {}) { options.operation?.assertCurrent(); const next = { ...meta, state: { ...meta.state, pending: meta.queue.length }, updatedAt: new Date().toISOString() }; await StorageManager.put("metadata", next, { notify: false }); options.operation?.assertCurrent(); if (options.notify !== false) emitSyncState(next); return next; }

async function scan(meta: SyncMetadata, operation: SessionOperation) {
  const found = new Map<string, { entity: ClientSyncEntity; recordId: string; data: unknown; hash: string }>();
  for (const store of stores) {
    const records = await StorageManager.getAll<unknown>(store);
    operation.assertCurrent();
    for (const record of records) {
      const id = idOf(record);
      if (!id || id === KEY || (store === "metadata" && id === STORAGE_MIGRATION_KEY)) continue;
      const entity = entityFor(store, id); const hash = await digest(record); found.set(`${entity}:${id}`, { entity, recordId: id, data: record, hash });
    }
  }
  const preferences = localPreferences(); const preferenceHash = await digest(preferences); found.set("workspace:preferences", { entity: "workspace", recordId: "preferences", data: preferences, hash: preferenceHash });
  const queue = new Map(meta.queue.map((item) => [`${item.entity}:${item.recordId}`, item])); const deviceId = AuthClient.deviceId();
  for (const [key, record] of found) { const known = meta.manifest[key]; if (known?.hash === record.hash) continue; queue.set(key, { ...record, operation: "upsert", baseVersion: known?.version ?? 0, updatedAt: new Date().toISOString(), deviceId }); }
  for (const [key, known] of Object.entries(meta.manifest)) { if (found.has(key)) continue; const separator = key.indexOf(":"); const entity = key.slice(0, separator) as ClientSyncEntity; const recordId = key.slice(separator + 1); queue.set(key, { entity, recordId, operation: "delete", baseVersion: known.version, updatedAt: new Date().toISOString(), hash: await digest({ deleted: key }), deviceId }); }
  return { ...meta, queue: [...queue.values()] };
}

async function apply(record: ClientCloudRecord, operation: SessionOperation, meta?: SyncMetadata) {
  operation.assertCurrent();
  if (record.entity === "workspace") { if (record.operation === "delete") return; operation.assertCurrent(); applySyncPreferences(localStorage, record.data); return; }
  const store = record.entity === "mentor" || record.entity === "learning" ? "metadata" : record.entity as StorageStoreName;
  if (!stores.includes(store as typeof stores[number])) return;
  if (record.operation === "delete") {
    await StorageManager.delete(store, record.recordId);
    operation.assertCurrent();
    if (record.entity === "documents") {
      await MaterialBinaryStorage.remove(record.recordId);
      MaterialRuntimeStore.remove(record.recordId);
      if (meta) delete meta.fileManifest[record.recordId];
    }
  } else {
    await StorageManager.put(store, record.data);
    operation.assertCurrent();
  }
}

async function uploadFiles(meta: SyncMetadata, operation: SessionOperation) {
  const documents = await StorageManager.getAll<Material>("documents"); const pending: Array<{ material: Material; file: File; hash: string }> = [];
  operation.assertCurrent();
  for (const material of documents) { operation.assertCurrent(); const file = await MaterialBinaryStorage.load(material); operation.assertCurrent(); if (!file) continue; const hash = await CloudFileService.hash(file); operation.assertCurrent(); if (meta.fileManifest[material.id] !== hash) pending.push({ material, file, hash }); }
  let uploadedBytes = 0;
  for (let index = 0; index < pending.length; index += 3) await Promise.all(pending.slice(index, index + 3).map(async ({ material, file, hash }) => { await CloudFileService.upload(material, file, operation); operation.assertCurrent(); meta.fileManifest[material.id] = hash; uploadedBytes += file.size; }));
  return uploadedBytes;
}

export const CloudSyncManager = {
  async state(userId?: string) { const operation = SessionOperationManager.start(userId); try { return (await loadMeta(operation)).state; } finally { operation.release(); } },
  async conflicts(userId?: string) { const operation = SessionOperationManager.start(userId); try { return (await loadMeta(operation)).conflicts; } finally { operation.release(); } },
  async syncNow(options: { userId?: string; handshake?: boolean } = {}): Promise<SyncMetadata> {
    const operation = SessionOperationManager.start(options.userId);
    if (options.handshake) handshakeRequested = true;
    if (running) {
      if (running.userId === operation.userId && running.generation === operation.generation) { rerunRequested = true; operation.release(); return running.promise; }
      operation.release();
      await running.promise.catch(() => undefined);
      return this.syncNow(options);
    }
    const runCycle = async () => {
      let meta = await loadMeta(operation);
      if (!navigator.onLine) return saveMeta({ ...meta, state: { ...meta.state, status: "offline" } }, { operation });
      try {
        meta = await scan(meta, operation); operation.assertCurrent(); meta = await saveMeta({ ...meta, state: { ...meta.state, status: "syncing", lastError: undefined } }, { operation });
        if (meta.queue.length || handshakeRequested) {
          handshakeRequested = false;
          const pushed = await AuthClient.request<{ accepted: ClientCloudRecord[]; conflicts: ClientConflict[] }>("/sync", { method: "POST", body: JSON.stringify({ mutations: meta.queue }), operation });
          operation.assertCurrent();
          const conflictKeys = new Set(pushed.conflicts.map((item) => `${item.entity}:${item.recordId}`));
          for (const item of pushed.accepted) { const key=`${item.entity}:${item.recordId}`; if(item.operation==="delete") delete meta.manifest[key]; else meta.manifest[key] = { hash: item.hash, version: item.version }; }
          meta.queue = meta.queue.filter((item) => conflictKeys.has(`${item.entity}:${item.recordId}`)); meta.conflicts = pushed.conflicts;
        }
        const pulled = await AuthClient.request<{ changes: ClientCloudRecord[]; cursor: number }>(`/sync?since=${meta.state.cursor}`, { operation });
        operation.assertCurrent();
        for (const item of pulled.changes) { operation.assertCurrent(); if (item.deviceId !== AuthClient.deviceId()) await apply(item, operation, meta); const key=`${item.entity}:${item.recordId}`; if(item.operation==="delete")delete meta.manifest[key];else meta.manifest[key] = { hash: item.hash, version: item.version }; }
        const uploadedBytes = await uploadFiles(meta, operation);
        operation.assertCurrent();
        meta = await saveMeta({ ...meta, state: { ...meta.state, status: "syncing", cursor: pulled.cursor, lastSyncAt: new Date().toISOString(), uploadedBytes: meta.state.uploadedBytes + uploadedBytes } }, { operation });
        const lastBackup = localStorage.getItem("studyai:last-cloud-backup"); if (!lastBackup || Date.now() - new Date(lastBackup).getTime() > 24 * 60 * 60 * 1000) { await AuthClient.request("/backup", { method: "POST", body: JSON.stringify({ action: "create" }), operation }); operation.assertCurrent(); localStorage.setItem("studyai:last-cloud-backup", new Date().toISOString()); }
        return meta;
      } catch (error) { if (error instanceof SessionChangedError || operation.signal.aborted) throw error; operation.assertCurrent(); return saveMeta({ ...meta, state: { ...meta.state, status: navigator.onLine ? "error" : "offline", lastError: error instanceof Error ? error.message : "Falha na sincronização." } }, { operation }); }
    };
    const promise = (async () => {
      let result: SyncMetadata;
      do {
        rerunRequested = false;
        result = await runCycle();
        if (result.state.status === "offline" || result.state.status === "error") return result;
        if (rerunRequested) continue;
        result = await saveMeta({ ...result, state: { ...result.state, status: "idle" } }, { notify: false, operation });
        if (!rerunRequested) { emitSyncState(result); return result; }
      } while (rerunRequested);
      return result!;
    })().finally(() => { operation.release(); if (running?.promise === promise) running = undefined; });
    running = { userId: operation.userId, generation: operation.generation, promise };
    return promise;
  },
  async resolve(conflict: ClientConflict, choice: "local" | "remote" | "merge", userId?: string) { const operation = SessionOperationManager.start(userId); try { const meta = await loadMeta(operation); if (choice === "remote") { await apply(conflict.remote, operation, meta); meta.manifest[`${conflict.entity}:${conflict.recordId}`] = { hash: conflict.remote.hash, version: conflict.remote.version }; meta.queue = meta.queue.filter((item) => `${item.entity}:${item.recordId}` !== `${conflict.entity}:${conflict.recordId}`); } else { meta.queue = meta.queue.map((item) => { if (`${item.entity}:${item.recordId}` !== `${conflict.entity}:${conflict.recordId}`) return item; const data = choice === "merge" && typeof conflict.remote.data === "object" && conflict.remote.data && typeof item.data === "object" && item.data ? { ...conflict.remote.data, ...item.data } : item.data; return { ...item, data, baseVersion: conflict.remote.version }; }); } operation.assertCurrent(); meta.conflicts = meta.conflicts.filter((item) => item.id !== conflict.id); await saveMeta(meta, { operation }); } finally { operation.release(); } return this.syncNow({ userId }); },
};
