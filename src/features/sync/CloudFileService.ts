import { AuthClient } from "@/features/account/AuthClient";
import { SessionOperationManager, type SessionOperation } from "@/features/account/SessionOperationManager";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import type { Material } from "@/types/material";

async function hash(file: Blob) { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())); let binary = ""; bytes.forEach((value) => { binary += String.fromCharCode(value); }); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }

async function withSession<T>(operation: SessionOperation | undefined, task: (active: SessionOperation) => Promise<T>) {
  const active = operation ?? SessionOperationManager.start();
  try { active.assertCurrent(); return await task(active); }
  finally { if (!operation) active.release(); }
}

function sessionHeaders(operation: SessionOperation, headers: Record<string, string> = {}) {
  return { ...headers, "x-studyai-session-user": operation.userId };
}

export const CloudFileService = {
  hash,
  async upload(material: Material, file: File, operation?: SessionOperation) {
    return withSession(operation, async (active) => {
      const digest = await hash(file);
      active.assertCurrent();
      const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "";
      const path = `/api/files/${encodeURIComponent(material.id)}`;
      const mime = file.type || material.mimeType || "application/octet-stream";
      const response = await fetch(path, { method: "PUT", body: file, signal: active.signal, headers: sessionHeaders(active, { "content-type": mime, "x-file-name": encodeURIComponent(file.name), "x-file-hash": digest, "x-csrf-token": csrf }) });
      active.assertCurrent();
      if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "Upload não concluído.");
      return digest;
    });
  },
  async download(material: Pick<Material, "id" | "name" | "mimeType">, operation?: SessionOperation) {
    return withSession(operation, async (active) => {
      const path = `/api/files/${encodeURIComponent(material.id)}`;
      const response = await fetch(path, { signal: active.signal, headers: sessionHeaders(active) });
      active.assertCurrent();
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Não foi possível baixar o material.");
      const file = new File([await response.blob()], material.name, { type: material.mimeType });
      await MaterialBinaryStorage.save(material.id, file);
      active.assertCurrent();
      return file;
    });
  },
  async remove(materialId: string, operation?: SessionOperation) {
    return withSession(operation, async (active) => {
      const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "";
      const response = await fetch(`/api/files/${encodeURIComponent(materialId)}`, {
        method: "DELETE",
        signal: active.signal,
        headers: sessionHeaders(active, { "x-csrf-token": csrf }),
      });
      active.assertCurrent();
      if (response.status === 401 || response.status === 404) return false;
      if (!response.ok) throw new Error("Não foi possível remover o material da nuvem.");
      return true;
    });
  },
  auth: AuthClient,
};