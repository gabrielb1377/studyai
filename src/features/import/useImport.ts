"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (completionRef.current) clearTimeout(completionRef.current);
    intervalRef.current = null;
    completionRef.current = null;
  }

  useEffect(() => clearTimers, []);

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

  function importFiles() {
    if (
      phase === "processing" ||
      !files.some((file) => file.status !== "complete")
    ) {
      return;
    }

    clearTimers();
    setFeedback("");
    setPhase("processing");
    setFiles((current) =>
      current.map((file) =>
        file.status === "complete"
          ? file
          : { ...file, status: "processing", progress: 12 },
      ),
    );

    intervalRef.current = setInterval(() => {
      setFiles((current) =>
        current.map((file) =>
          file.status === "processing"
            ? { ...file, progress: Math.min(file.progress + 11, 89) }
            : file,
        ),
      );
    }, 180);

    completionRef.current = setTimeout(() => {
      clearTimers();
      setFiles((current) =>
        current.map((file) =>
          file.status === "processing"
            ? { ...file, status: "complete", progress: 100 }
            : file,
        ),
      );
      setPhase("complete");
    }, 1_650);
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
