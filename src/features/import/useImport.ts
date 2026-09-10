"use client";

import { useMemo, useState } from "react";
import { ExtractionPipeline } from "@/features/extraction/ExtractionPipeline";
import type { ImportFile, ImportPhase } from "@/types/import";
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

  function addFiles(incoming: File[]): AddFilesResult {
    const unsupported = incoming.filter((file) => !isSupportedFile(file));
    const supported = incoming.filter(isSupportedFile);
    const existingIds = new Set(files.map(({ file }) => getFileIdentity(file)));
    const duplicates: File[] = [];
    const unique: File[] = [];
    supported.forEach((file) => {
      const identity = getFileIdentity(file);
      if (existingIds.has(identity)) {
        duplicates.push(file);
        return;
      }
      existingIds.add(identity);
      unique.push(file);
    });

    setFiles((current) => [
      ...current,
      ...unique.map((file) => ({
        id: crypto.randomUUID(),
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
    setFiles((current) =>
      current.map((file) =>
        pendingFiles.some((pending) => pending.id === file.id)
          ? { ...file, status: "processing", progress: 10 }
          : file,
      ),
    );

    await ExtractionPipeline.run(pendingFiles, {
      onProgress: ({ fileId, status, progress }) => {
        setFiles((current) => current.map((file) => file.id === fileId
          ? {
              ...file,
              status: status === "extracted" ? "complete" : status,
              progress,
            }
          : file,
        ));
      },
    });
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
