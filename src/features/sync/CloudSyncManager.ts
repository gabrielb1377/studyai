import { AuthClient } from "@/features/account/AuthClient";
import { StorageManager } from "@/lib/storage/StorageManager";
import { STORAGE_MIGRATION_KEY, type StorageStoreName } from "@/lib/storage/StorageVersion";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import type { Material } from "@/types/material";
import { CloudFileService } from "./CloudFileService";
import type { ClientCloudRecord, ClientConflict, ClientSyncEntity, SyncMetadata } from "./types";

const KEY = "cloud-sync:v1";
const stores = ["documents", "contents", "chunks", "embeddings", "studies", "notes", "summaries", "flashcards", "quizzes", "transcriptions", "ocr", "knowledge", "metadata"] as const satisfies readonly StorageStoreName[];
const preferencePrefixes = ["studyai:workspace", "studyai:ai-settings", "studyai:platform-settings", "studyai:experience-settings", "studyai-theme", "studyai:sidebar", "studyai:language"];
let running: Promise<SyncMetadata> | undefined;
let rerunRequested = false;
let handshakeRequested = false;

function empty(): SyncMetadata { return { key: KEY, state: { status: navigator.onLine ? "idle" : "offline", cursor: 0, pending: 0, uploadedBytes: 0 }, manifest: {}, queue: [], conflicts: [], fileManifest: {}, updatedAt: new Date().toISOString() }; }
function stable(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;return`{${Object.entries(value as Record<string,unknown>).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;}
async function digest(value: unknown) { const bytes = new TextEncoder().encode(stable(value)); return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((item) => item.toString(16).padStart(2, "0")).join(""); }
function idOf(record: unknown) { if (!record || typeof record !== "object") return; const value = record as Record<string, unknown>; return [value.id, value.studyId, value.chunkId, value.key].find((item): item is string => typeof item === "string"); }
function entityFor(store: StorageStoreName, id: string): ClientSyncEntity { if (store === "metadata" && id.startsWith("mentor:")) return "mentor"; if (store === "metadata" && id.startsWith("learning-")) return "learning"; return store; }
function localPreferences() { return Object.fromEntries(Object.entries(localStorage).filter(([key]) => preferencePrefixes.some((prefix) => key.startsWith(prefix)))); }

async function loadMeta() { return await StorageManager.get<SyncMetadata>("metadata", KEY) ?? empty(); }
function emitSyncState(meta: SyncMetadata) { window.dispatchEvent(new CustomEvent("studyai:cloud-sync", { detail: meta.state })); }
async function saveMeta(meta: SyncMetadata, options: { notify?: boolean } = {}) { const next = { ...meta, state: { ...meta.state, pending: meta.queue.length }, updatedAt: new Date().toISOString() }; await StorageManager.put("metadata", next, { notify: false }); if (options.notify !== false) emitSyncState(next); return next; }

async function scan(meta: SyncMetadata) {
  const found = new Map<string, { entity: ClientSyncEntity; recordId: string; data: unknown; hash: string }>();
  for (const store of stores) {
    const records = await StorageManager.getAll<unknown>(store);
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

async function apply(record: ClientCloudRecord, meta?: SyncMetadata) {
  if (record.entity === "workspace") { if (record.operation === "delete") return; for (const [key, value] of Object.entries(record.data as Record<string, string> ?? {})) localStorage.setItem(key, value); return; }
  const store = record.entity === "mentor" || record.entity === "learning" ? "metadata" : record.entity as StorageStoreName;
  if (!stores.includes(store as typeof stores[number])) return;
  if (record.operation === "delete") {
    await StorageManager.delete(store, record.recordId);
    if (record.entity === "documents") {
      await MaterialBinaryStorage.remove(record.recordId);
      MaterialRuntimeStore.remove(record.recordId);
      if (meta) delete meta.fileManifest[record.recordId];
    }
  } else {
    await StorageManager.put(store, record.data);
  }
}

async function uploadFiles(meta: SyncMetadata) {
  const documents = await StorageManager.getAll<Material>("documents"); const pending: Array<{ material: Material; file: File; hash: string }> = [];
  for (const material of documents) { const file = await MaterialBinaryStorage.load(material); if (!file) continue; const hash = await CloudFileService.hash(file); if (meta.fileManifest[material.id] !== hash) pending.push({ material, file, hash }); }
  let uploadedBytes = 0;
  for (let index = 0; index < pending.length; index += 3) await Promise.all(pending.slice(index, index + 3).map(async ({ material, file, hash }) => { await CloudFileService.upload(material, file); meta.fileManifest[material.id] = hash; uploadedBytes += file.size; }));
  return uploadedBytes;
}

export const CloudSyncManager = {
  async state() { return (await loadMeta()).state; },
  async conflicts() { return (await loadMeta()).conflicts; },
  async syncNow(options: { handshake?: boolean } = {}) {
    if (options.handshake) handshakeRequested = true;
    if (running) { rerunRequested = true; return running; }
    const runCycle = async () => {
      let meta = await loadMeta();
      if (!navigator.onLine) return saveMeta({ ...meta, state: { ...meta.state, status: "offline" } });
      try {
        meta = await scan(meta); meta = await saveMeta({ ...meta, state: { ...meta.state, status: "syncing", lastError: undefined } });
        if (meta.queue.length || handshakeRequested) {
          handshakeRequested = false;
          const pushed = await AuthClient.request<{ accepted: ClientCloudRecord[]; conflicts: ClientConflict[] }>("/sync", { method: "POST", body: JSON.stringify({ mutations: meta.queue }) });
          const conflictKeys = new Set(pushed.conflicts.map((item) => `${item.entity}:${item.recordId}`));
          for (const item of pushed.accepted) { const key=`${item.entity}:${item.recordId}`; if(item.operation==="delete") delete meta.manifest[key]; else meta.manifest[key] = { hash: item.hash, version: item.version }; }
          meta.queue = meta.queue.filter((item) => conflictKeys.has(`${item.entity}:${item.recordId}`)); meta.conflicts = pushed.conflicts;
        }
        const pulled = await AuthClient.request<{ changes: ClientCloudRecord[]; cursor: number }>(`/sync?since=${meta.state.cursor}`);
        for (const item of pulled.changes) { if (item.deviceId !== AuthClient.deviceId()) await apply(item, meta); const key=`${item.entity}:${item.recordId}`; if(item.operation==="delete")delete meta.manifest[key];else meta.manifest[key] = { hash: item.hash, version: item.version }; }
        const uploadedBytes = await uploadFiles(meta);
        meta = await saveMeta({ ...meta, state: { ...meta.state, status: "syncing", cursor: pulled.cursor, lastSyncAt: new Date().toISOString(), uploadedBytes: meta.state.uploadedBytes + uploadedBytes } });
        const lastBackup = localStorage.getItem("studyai:last-cloud-backup"); if (!lastBackup || Date.now() - new Date(lastBackup).getTime() > 24 * 60 * 60 * 1000) { await AuthClient.request("/backup", { method: "POST", body: JSON.stringify({ action: "create" }) }); localStorage.setItem("studyai:last-cloud-backup", new Date().toISOString()); }
        return meta;
      } catch (error) { return saveMeta({ ...meta, state: { ...meta.state, status: navigator.onLine ? "error" : "offline", lastError: error instanceof Error ? error.message : "Falha na sincronização." } }); }
    };
    running = (async () => {
      let result: SyncMetadata;
      do {
        rerunRequested = false;
        result = await runCycle();
        if (result.state.status === "offline" || result.state.status === "error") return result;
        if (rerunRequested) continue;
        result = await saveMeta({ ...result, state: { ...result.state, status: "idle" } }, { notify: false });
        if (!rerunRequested) { emitSyncState(result); return result; }
      } while (rerunRequested);
      return result!;
    })().finally(() => { running = undefined; });
    return running;
  },
  async resolve(conflict: ClientConflict, choice: "local" | "remote" | "merge") { const meta = await loadMeta(); if (choice === "remote") { await apply(conflict.remote, meta); meta.manifest[`${conflict.entity}:${conflict.recordId}`] = { hash: conflict.remote.hash, version: conflict.remote.version }; meta.queue = meta.queue.filter((item) => `${item.entity}:${item.recordId}` !== `${conflict.entity}:${conflict.recordId}`); } else { meta.queue = meta.queue.map((item) => { if (`${item.entity}:${item.recordId}` !== `${conflict.entity}:${conflict.recordId}`) return item; const data = choice === "merge" && typeof conflict.remote.data === "object" && conflict.remote.data && typeof item.data === "object" && item.data ? { ...conflict.remote.data, ...item.data } : item.data; return { ...item, data, baseVersion: conflict.remote.version }; }); } meta.conflicts = meta.conflicts.filter((item) => item.id !== conflict.id); await saveMeta(meta); return this.syncNow(); },
};
