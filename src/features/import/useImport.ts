"use client";

import { useMemo, useState } from "react";
import { ExtractionPipeline } from "@/features/extraction/ExtractionPipeline";
import { OrganizationService } from "@/features/organization/OrganizationService";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import { MaterialService } from "@/services/material-service";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import type { ImportFile, ImportPhase } from "@/types/import";
import type { MaterialFileType } from "@/types/material";
import {
  getFileExtension,
  getFileIdentity,
  isSupportedFile,
} from "./import-utils";

type AddFilesResult = { unsupported: string[]; duplicates: string[] };

export function useImport() {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [feedback, setFeedback] = useState("");

  async function addFiles(incoming: File[]): Promise<AddFilesResult> {
    const unsupported = incoming.filter((file) => !isSupportedFile(file));
    const supported = incoming.filter(isSupportedFile);
    const queuedIds = new Set(files.map(({ file }) => getFileIdentity(file)));
    const existingMaterials = await MaterialService.load();
    const existingByIdentity = new Map(existingMaterials.map((material) => [material.identity, material]));
    const duplicates: File[] = [];
    const recoveries: File[] = [];
    const unique: Array<{ file: File; id: string }> = [];
    for (const file of supported) {
      const identity = getFileIdentity(file);
      if (queuedIds.has(identity)) {
        duplicates.push(file);
        continue;
      }
      queuedIds.add(identity);
      const existing = existingByIdentity.get(identity);
      if (existing) {
        const runtimeFile = MaterialRuntimeStore.get(existing.id);
        const localFile = await MaterialBinaryStorage.load(existing);
        if (!runtimeFile && !localFile) {
          unique.push({ file, id: existing.id });
          recoveries.push(file);
        } else {
          duplicates.push(file);
        }
        continue;
      }
      unique.push({ file, id: crypto.randomUUID() });
    }

    setFiles((current) => [
      ...current,
      ...unique.map(({ file, id }) => ({
        id,
        file,
        extension: getFileExtension(file.name),
        progress: 0,
        status: "uploaded" as const,
      })),
    ]);
    if (unique.length > 0) setPhase("idle");

    const messages = [];
    if (unsupported.length) {
      messages.push(
        `${unsupported.length} ${unsupported.length === 1 ? "arquivo não compatível foi ignorado" : "arquivos não compatíveis foram ignorados"}`,
      );
    }
    if (duplicates.length) {
      messages.push(
        `${duplicates.length} ${duplicates.length === 1 ? "arquivo repetido não foi adicionado" : "arquivos repetidos não foram adicionados"}`,
      );
    }
    if (recoveries.length) {
      messages.push(
        `${recoveries.length} ${recoveries.length === 1 ? "material sem cópia local será restaurado" : "materiais sem cópia local serão restaurados"}`,
      );
    }
    setFeedback(messages.join(". "));
    return {
      unsupported: unsupported.map((file) => file.name),
      duplicates: duplicates.map((file) => file.name),
    };
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((file) => file.id !== id));
    setFeedback("");
  }

  async function importFiles() {
    if (
      phase === "processing" ||
      !files.some((file) => file.status === "uploaded" || file.status === "error")
    ) {
      return;
    }

    setFeedback("");
    setPhase("processing");
    const pendingFiles = files.filter(
      (file) => file.status === "uploaded" || file.status === "error",
    );
    const extractionInputs = [];
    for (const item of pendingFiles) {
      const existingMaterial = await MaterialService.findById(item.id);
      const material = existingMaterial
        ? {
            ...existingMaterial,
            status: "processing" as const,
            progress: 0,
            error: undefined,
            updatedAt: new Date().toISOString(),
          }
        : MaterialService.createFromFile(
            item.file,
            item.extension as MaterialFileType,
            item.id,
          );
      MaterialRuntimeStore.register(item.id, item.file);
      const persistentBinary = await MaterialBinaryStorage.save(item.id, item.file);
      await MaterialService.upsert({ ...material, persistentBinary });
      const organized = await OrganizationService.organizeImported(material.id);
      extractionInputs.push({ id: item.id, file: item.file, studyId: organized.studyId });
    }
    setFiles((current) =>
      current.map((file) =>
        pendingFiles.some((pending) => pending.id === file.id)
          ? { ...file, status: "processing", progress: 10 }
          : file,
      ),
    );

    const results = await ExtractionPipeline.run(extractionInputs, {
      onProgress: ({ fileId, status, progress, stage, message, errorDetails }) => {
        void MaterialService.update(fileId, {
          progress,
          status: status === "extracted" ? "ready" : status,
        });
        setFiles((current) => current.map((file) => file.id === fileId
          ? {
              ...file,
              status: status === "extracted" ? "complete" : status,
              progress,
              stage,
              message,
              errorDetails,
            }
          : file,
        ));
      },
    });
    for (const result of results) {
      if (result.status === "error") {
        await MaterialService.update(result.fileId, {
          status: "error",
          progress: 100,
          error: result.error,
        });
        setFiles((current) => current.map((file) => file.id === result.fileId
          ? { ...file, errorDetails: result.errorDetails }
          : file,
        ));
      } else {
        await MaterialService.update(result.fileId, { status: "ready", progress: 100, error: undefined });
      }
    }
    setPhase("complete");
  }

  const overallProgress = useMemo(
    () =>
      files.length
        ? Math.round(
            files.reduce((total, file) => total + file.progress, 0) /
              files.length,
          )
        : 0,
    [files],
  );

  return {
    files,
    phase,
    feedback,
    overallProgress,
    addFiles,
    removeFile,
    importFiles,
  };
}
