import { AuthClient } from "@/features/account/AuthClient";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import type { Material } from "@/types/material";

async function hash(file: Blob) { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())); let binary = ""; bytes.forEach((value) => { binary += String.fromCharCode(value); }); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }

export const CloudFileService = {
  hash,
  async upload(material: Material, file: File) {
    const digest = await hash(file);
    const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "";
    const response = await fetch(`/api/files/${encodeURIComponent(material.id)}`, { method: "PUT", body: file, headers: { "content-type": file.type || material.mimeType, "x-file-name": encodeURIComponent(file.name), "x-file-hash": digest, "x-csrf-token": csrf } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "Upload não concluído.");
    return digest;
  },
  async download(material: Pick<Material, "id" | "name" | "mimeType">) {
    const response = await fetch(`/api/files/${encodeURIComponent(material.id)}`);
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Não foi possível baixar o material.");
    const file = new File([await response.blob()], material.name, { type: material.mimeType });
    await MaterialBinaryStorage.save(material.id, file);
    return file;
  },
  async remove(materialId: string) {
    const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "";
    const response = await fetch(`/api/files/${encodeURIComponent(materialId)}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrf },
    });
    if (response.status === 401 || response.status === 404) return false;
    if (!response.ok) throw new Error("Não foi possível remover o material da nuvem.");
    return true;
  },
  auth: AuthClient,
};
