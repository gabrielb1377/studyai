"use client";

import { useMemo, useRef, useState } from "react";
import { ExtractionPipeline } from "@/features/extraction/ExtractionPipeline";
import { OCRService } from "@/features/extraction/OCRService";
import { OCR_LIMITS } from "@/features/ocr/limits";
import type { MediaTranscriptionMode, OcrMode } from "@/features/extraction/ExtractionTypes";
import { hasBlockedMediaMime, isWithinMediaLimit } from "@/features/extraction/media-validation";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { OrganizationService } from "@/features/organization/OrganizationService";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import { MaterialService } from "@/services/material-service";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import type { DuplicateConflict, ImportFile, ImportPhase } from "@/types/import";
import type { MaterialFileType } from "@/types/material";
import {
  getFileExtension,
  getFileContentHash,
  getFileIdentity,
  isSupportedFile,
} from "./import-utils";

type AddFilesResult = { unsupported: string[]; duplicates: string[] };
type DuplicateAction = "replace" | "ignore" | "copy";
const imageExtensions = new Set(["png", "jpg", "jpeg", "webp"]);

function withinImportLimits(file: File) {
  const extension = getFileExtension(file.name);
  if (imageExtensions.has(extension)) return file.size <= OCR_LIMITS.maxImageBytes;
  if (extension === "pdf") return file.size <= OCR_LIMITS.maxDocumentBytes;
  return isWithinMediaLimit(file);
}

export function useImport() {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [feedback, setFeedback] = useState("");
  const [duplicateConflicts, setDuplicateConflicts] = useState<DuplicateConflict[]>([]);
  const [ocrMode, setOcrMode] = useState<OcrMode>("auto");
  const [transcriptionMode, setTranscriptionMode] = useState<MediaTranscriptionMode>("auto");
  const abortRef = useRef<AbortController | null>(null);

  function cancelImport() {
    abortRef.current?.abort();
    void OCRService.cancel();
    setFeedback("Cancelando o processamento. As páginas já concluídas serão preservadas.");
  }

  async function addFiles(incoming: File[]): Promise<AddFilesResult> {
    const unsupported = incoming.filter((file) => !isSupportedFile(file) || hasBlockedMediaMime(file));
    const recognized = incoming.filter((file) => isSupportedFile(file) && !hasBlockedMediaMime(file));
    const emptyFiles = recognized.filter((file) => file.size <= 0);
    const nonEmpty = recognized.filter((file) => file.size > 0);
    const oversized = nonEmpty.filter((file) => !withinImportLimits(file));
    const supported = nonEmpty.filter(withinImportLimits);
    const queuedIds = new Set(files.map(({ file }) => getFileIdentity(file)));
    const queuedHashes = new Set(files.flatMap((item) => item.contentHash
      ? [`${item.extension}:${item.contentHash}`]
      : [],
    ));
    const existingMaterials = await MaterialService.load();
    for (const material of existingMaterials) {
      if (material.contentHash) continue;
      const storedFile = MaterialRuntimeStore.get(material.id)?.file ?? await MaterialBinaryStorage.load(material);
      if (!storedFile) continue;
      material.contentHash = await getFileContentHash(storedFile);
      await MaterialService.update(material.id, { contentHash: material.contentHash });
    }
    const existingByIdentity = new Map(existingMaterials.map((material) => [material.identity, material]));
    const existingByHash = new Map(existingMaterials.filter((material) => material.contentHash).map((material) => [`${material.fileType}:${material.contentHash}`, material]));
    const duplicates: File[] = [];
    const ignoredQueueDuplicates: File[] = [];
    const recoveries: File[] = [];
    const unique: Array<{ file: File; id: string; contentHash: string }> = [];
    const conflicts: DuplicateConflict[] = [];
    for (const file of supported) {
      const identity = getFileIdentity(file);
      const extension = getFileExtension(file.name);
      const contentHash = await getFileContentHash(file);
      const hashKey = `${extension}:${contentHash}`;
      const hashDuplicate = existingByHash.get(hashKey);
      if (queuedIds.has(identity)) {
        duplicates.push(file);
        ignoredQueueDuplicates.push(file);
        continue;
      }
      if (queuedHashes.has(hashKey)) {
        duplicates.push(file);
        conflicts.push({ id: crypto.randomUUID(), file, extension, contentHash, reason: "queue" });
        continue;
      }
      queuedIds.add(identity);
      queuedHashes.add(hashKey);
      const existing = existingByIdentity.get(identity) ?? hashDuplicate;
      if (existing) {
        const runtimeFile = MaterialRuntimeStore.get(existing.id);
        const localFile = await MaterialBinaryStorage.load(existing);
        if (!runtimeFile && !localFile) {
          unique.push({ file, id: existing.id, contentHash });
          recoveries.push(file);
        } else {
          duplicates.push(file);
          conflicts.push({ id: crypto.randomUUID(), file, extension, contentHash, existingMaterialId: existing.id, existingName: existing.name, reason: hashDuplicate ? "content" : "identity" });
        }
        continue;
      }
      unique.push({ file, id: crypto.randomUUID(), contentHash });
    }

    setFiles((current) => [
      ...current,
      ...unique.map(({ file, id, contentHash }) => ({
        id,
        file,
        extension: getFileExtension(file.name),
        contentHash,
        progress: 0,
        status: "uploaded" as const,
      })),
    ]);
    if (unique.length > 0) setPhase("idle");

    const messages = [];
    if (emptyFiles.length) {
      messages.push(`Arquivos vazios ignorados: ${emptyFiles.map((file) => file.name).join(", ")}`);
    }
    if (oversized.length) {
      messages.push(`Arquivos acima do limite (PDF: 150 MB, imagem: 40 MB, áudio: 100 MB, vídeo: 250 MB): ${oversized.map((file) => file.name).join(", ")}`);
    }
    if (unsupported.length) {
      messages.push(
        `${unsupported.length} ${unsupported.length === 1 ? "arquivo não compatível foi ignorado" : "arquivos não compatíveis foram ignorados"}`,
      );
    }
    if (conflicts.length) {
      setDuplicateConflicts((current) => [...current, ...conflicts]);
      messages.push(
        `${duplicates.length} ${duplicates.length === 1 ? "duplicado precisa de uma decisão" : "duplicados precisam de uma decisão"}`,
      );
    }
    if (ignoredQueueDuplicates.length) {
      messages.push(
        `${ignoredQueueDuplicates.length} ${ignoredQueueDuplicates.length === 1 ? "arquivo repetido não foi adicionado" : "arquivos repetidos não foram adicionados"}`,
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

  function resolveDuplicates(action: DuplicateAction) {
    if (action !== "ignore") {
      setFiles((current) => [
        ...current,
        ...duplicateConflicts.map((conflict) => ({
          id: action === "replace" && conflict.existingMaterialId ? conflict.existingMaterialId : crypto.randomUUID(),
          file: conflict.file,
          extension: conflict.extension,
          contentHash: conflict.contentHash,
          progress: 0,
          status: "uploaded" as const,
        })),
      ]);
      setPhase("idle");
    }
    setFeedback(action === "replace" ? "Os materiais existentes serão substituídos." : action === "copy" ? "As cópias serão importadas como novos materiais." : "Os arquivos duplicados foram ignorados.");
    setDuplicateConflicts([]);
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

    let sessionOperation: ReturnType<typeof SessionOperationManager.start>;
    try {
      sessionOperation = SessionOperationManager.start();
    } catch {
      setFeedback("Sua sessão mudou. Entre novamente antes de importar.");
      return;
    }

    setFeedback("");
    setPhase("processing");
    const controller = new AbortController();
    const abortFromSession = () => controller.abort();
    sessionOperation.signal.addEventListener("abort", abortFromSession, { once: true });
    abortRef.current = controller;

    try {
      const pendingFiles = files.filter(
        (file) => file.status === "uploaded" || file.status === "error",
      );
      const extractionInputs = [];
      for (const item of pendingFiles) {
        sessionOperation.assertCurrent();
        const existingMaterial = await MaterialService.findById(item.id);
        sessionOperation.assertCurrent();
        const material = existingMaterial
          ? {
              ...existingMaterial,
              status: "processing" as const,
              progress: 0,
              error: undefined,
              contentHash: item.contentHash ?? existingMaterial.contentHash,
              updatedAt: new Date().toISOString(),
            }
          : MaterialService.createFromFile(
              item.file,
              item.extension as MaterialFileType,
              item.id,
              item.contentHash,
            );
        MaterialRuntimeStore.register(item.id, item.file);
        const persistentBinary = await MaterialBinaryStorage.save(item.id, item.file);
        sessionOperation.assertCurrent();
        await MaterialService.upsert({ ...material, persistentBinary });
        const organized = await OrganizationService.organizeImported(material.id);
        sessionOperation.assertCurrent();
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
        ocrMode,
        transcriptionMode,
        signal: controller.signal,
        onProgress: ({ fileId, status, progress, stage, message, errorDetails, cancelled }) => {
          try {
            sessionOperation.assertCurrent();
          } catch {
            return;
          }
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
                message: cancelled ? "Cancelado; conteúdo parcial preservado." : message,
                errorDetails,
              }
            : file,
          ));
        },
      });
      sessionOperation.assertCurrent();
      for (const result of results) {
        sessionOperation.assertCurrent();
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
      if (controller.signal.aborted) {
        setFiles((current) => current.map((file) => file.status === "processing"
          ? { ...file, status: "uploaded", progress: 0, message: "Cancelado antes do processamento." }
          : file));
        setFeedback("Importação cancelada. Os arquivos e páginas já concluídos foram preservados.");
      }
    } catch {
      if (sessionOperation.signal.aborted) {
        setFeedback("Importação interrompida porque a sessão foi alterada.");
        setPhase("idle");
      }
    } finally {
      abortRef.current = null;
      sessionOperation.signal.removeEventListener("abort", abortFromSession);
      sessionOperation.release();
    }
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
    duplicateConflicts,
    overallProgress,
    addFiles,
    removeFile,
    importFiles,
    resolveDuplicates,
    ocrMode,
    setOcrMode,
    transcriptionMode,
    setTranscriptionMode,
    cancelImport,
  };
}
