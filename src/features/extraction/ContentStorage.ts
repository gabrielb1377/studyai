import { StorageManager } from "@/lib/storage/StorageManager";
import {
  extractionFileTypes,
  ocrModes,
  type ExtractedContent,
  type ExtractedPage,
  type ExtractionMetadata,
  type ExtractionStatus,
  type ExtractionStore,
  type OcrPipelineInfo,
  type PageMethod,
  type PageStatus,
  type PageQuality,
  type QualityLevel,
  ingestionStageIds,
} from "./ExtractionTypes";

export const EXTRACTION_UPDATE_EVENT = "studyai:extraction-updated";

function isStatus(value: unknown): value is ExtractionStatus {
  return value === "processing" || value === "extracted" || value === "error";
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}

function isOptionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

function isOptionalStringList(value: unknown) {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

const pageMethods: readonly PageMethod[] = ["native", "ocr", "none"];
const pageStatuses: readonly PageStatus[] = ["ready", "review", "error"];
const qualityLevels: readonly QualityLevel[] = ["good", "fair", "poor", "unknown"];

function isPageQuality(value: unknown): value is PageQuality {
  if (typeof value !== "object" || value === null) return false;
  const quality = value as Partial<PageQuality>;
  return qualityLevels.includes(quality.level as QualityLevel) && isOptionalStringList(quality.issues);
}

function isExtractedPage(value: unknown): value is ExtractedPage {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Partial<ExtractedPage>;
  return typeof page.page === "number" && Number.isInteger(page.page) && page.page > 0 &&
    pageMethods.includes(page.method as PageMethod) &&
    pageStatuses.includes(page.status as PageStatus) &&
    typeof page.text === "string" && typeof page.originalText === "string" &&
    typeof page.edited === "boolean" && typeof page.needsOcr === "boolean" &&
    isOptionalString(page.editedAt) && isOptionalNumber(page.confidence) &&
    isOptionalNumber(page.width) && isOptionalNumber(page.height) &&
    isOptionalNumber(page.rotation) && isOptionalNumber(page.durationMs) &&
    isPageQuality(page.quality) && isOptionalStringList(page.warnings) &&
    Array.isArray(page.tables) && page.tables.every((table) => (
      typeof table === "object" && table !== null &&
      typeof table.id === "string" && typeof table.page === "number" &&
      typeof table.markdown === "string" && typeof table.header === "boolean" &&
      typeof table.complete === "boolean" && typeof table.columns === "number" &&
      (table.source === "text" || table.source === "ocr") &&
      isOptionalStringList(table.warnings) &&
      Array.isArray(table.rows) && table.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string"))
    ));
}

function isPipelineInfo(value: unknown): value is OcrPipelineInfo {
  if (typeof value !== "object" || value === null) return false;
  const pipeline = value as Partial<OcrPipelineInfo>;
  return typeof pipeline.version === "string" && ocrModes.includes(pipeline.mode as typeof ocrModes[number]) &&
    (pipeline.engine === "tesseract.js" || pipeline.engine === "pdfjs" || pipeline.engine === "none") &&
    typeof pipeline.pages === "number" && typeof pipeline.nativePages === "number" &&
    typeof pipeline.ocrPages === "number" && typeof pipeline.failedPages === "number" &&
    typeof pipeline.reviewedPages === "number" && typeof pipeline.cancelled === "boolean" &&
    isOptionalStringList(pipeline.warnings) && isOptionalNumber(pipeline.durationMs) &&
    typeof pipeline.createdAt === "string" && typeof pipeline.updatedAt === "string";
}

function isMetadata(value: unknown): value is ExtractionMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<ExtractionMetadata>;
  return typeof metadata.name === "string" && typeof metadata.type === "string" &&
    typeof metadata.size === "number" &&
    isOptionalString(metadata.title) && isOptionalString(metadata.subject) &&
    isOptionalString(metadata.topic) && isOptionalString(metadata.institution) &&
    isOptionalString(metadata.professor) && isOptionalStringList(metadata.subtopics) &&
    isOptionalStringList(metadata.keywords) && isOptionalString(metadata.summaryPreview) &&
    isOptionalNumber(metadata.pageCount) && isOptionalNumber(metadata.duration) &&
    isOptionalString(metadata.language) && isOptionalString(metadata.encoding) &&
    isOptionalNumber(metadata.wordCount) && isOptionalNumber(metadata.readingTimeMinutes) &&
    isOptionalNumber(metadata.width) && isOptionalNumber(metadata.height) &&
    isOptionalBoolean(metadata.hasTextLayer) && isOptionalBoolean(metadata.ocrPerformed) &&
    isOptionalNumber(metadata.ocrConfidence) && isOptionalBoolean(metadata.transcriptionPerformed) &&
    isOptionalString(metadata.transcriptionModel) && isOptionalNumber(metadata.transcriptionConfidence) &&
    isOptionalNumber(metadata.processingTimeMs) && isOptionalString(metadata.createdAt) &&
    isOptionalString(metadata.updatedAt);
}

function isPipelineData(content: Partial<ExtractedContent>) {
  const validStages = content.stages === undefined || (
    Array.isArray(content.stages) && content.stages.every((stage) =>
      typeof stage === "object" && stage !== null &&
      ingestionStageIds.includes(stage.id) &&
      ["pending", "processing", "completed", "skipped", "error"].includes(stage.status) &&
      isOptionalString(stage.message) && isOptionalString(stage.startedAt) && isOptionalString(stage.completedAt),
    )
  );
  const validLogs = content.logs === undefined || (
    Array.isArray(content.logs) && content.logs.every((log) =>
      typeof log === "object" && log !== null && typeof log.id === "string" &&
      ingestionStageIds.includes(log.stage) &&
      ["processing", "completed", "skipped", "error"].includes(log.status) &&
      typeof log.message === "string" && typeof log.createdAt === "string",
    )
  );
  const validError = content.errorDetails === undefined || (
    typeof content.errorDetails === "object" && content.errorDetails !== null &&
    typeof content.errorDetails.reason === "string" && typeof content.errorDetails.fileName === "string" &&
    ingestionStageIds.includes(content.errorDetails.stage) &&
    isOptionalString(content.errorDetails.simplifiedStack) &&
    typeof content.errorDetails.suggestedAction === "string"
  );
  return validStages && validLogs && validError;
}

function isExtractedContent(value: unknown): value is ExtractedContent {
  if (typeof value !== "object" || value === null) return false;
  const content = value as Partial<ExtractedContent>;
  return typeof content.id === "string" && typeof content.studyId === "string" &&
    typeof content.fileId === "string" &&
    extractionFileTypes.includes(content.fileType as typeof extractionFileTypes[number]) &&
    typeof content.extractedText === "string" && isMetadata(content.metadata) &&
    isStatus(content.status) && typeof content.createdAt === "string" &&
    (content.error === undefined || typeof content.error === "string") && isPipelineData(content) &&
    (content.pages === undefined || (Array.isArray(content.pages) && content.pages.every(isExtractedPage))) &&
    (content.pipeline === undefined || isPipelineInfo(content.pipeline));
}

export const ContentStorage = {
  async load(): Promise<ExtractionStore> {
    const stored = await StorageManager.getAll<unknown>("contents");
    const records: ExtractedContent[] = [];
    for (const value of stored) {
      if (isExtractedContent(value)) {
        records.push(value);
        continue;
      }
      // Preserva registros antigos ou parcialmente corrompidos sem descartar o material.
      if (typeof value !== "object" || value === null) continue;
      const fallback = { ...(value as ExtractedContent), pages: undefined, pipeline: undefined };
      if (isExtractedContent(fallback)) records.push(fallback);
    }
    return { version: 1 as const, records };
  },

  async save(store: ExtractionStore) {
    await StorageManager.replaceAll("contents", store.records);
    window.dispatchEvent(new Event(EXTRACTION_UPDATE_EVENT));
  },

  async upsert(record: ExtractedContent) {
    await StorageManager.transaction(["contents", "transcriptions", "ocr"], async (storage) => {
      await storage.put("contents", record);
      if (record.transcription) {
        await storage.put("transcriptions", {
          id: `transcription-${record.id}`,
          fileId: record.fileId,
          studyId: record.studyId,
          value: record.transcription,
          updatedAt: new Date().toISOString(),
        });
      }
      if (record.metadata.ocrPerformed || record.pages?.length) {
        await storage.put("ocr", {
          id: `ocr-${record.id}`,
          fileId: record.fileId,
          studyId: record.studyId,
          pipelineVersion: record.pipeline?.version ?? record.metadata.pipelineVersion,
          mode: record.pipeline?.mode ?? record.metadata.extractionMode,
          pages: record.pipeline?.pages ?? record.pages?.length ?? 0,
          ocrPages: record.pipeline?.ocrPages ?? record.metadata.ocrPages,
          nativePages: record.pipeline?.nativePages ?? record.metadata.nativePages,
          failedPages: record.pipeline?.failedPages ?? record.metadata.failedPages,
          reviewedPages: record.pipeline?.reviewedPages ?? record.metadata.reviewedPages,
          quality: record.metadata.quality,
          confidence: record.metadata.ocrConfidence,
          updatedAt: new Date().toISOString(),
        });
      }
    });
    window.dispatchEvent(new Event(EXTRACTION_UPDATE_EVENT));
  },

  async updateFile(fileId: string, changes: Partial<Pick<ExtractedContent, "studyId">> & { name?: string }) {
    const store = await this.load();
    const targets = store.records.filter((record) => record.fileId === fileId).map((record) => ({
      ...record,
      ...(changes.studyId ? { studyId: changes.studyId } : {}),
      metadata: changes.name ? { ...record.metadata, name: changes.name } : record.metadata,
    }));
    await StorageManager.transaction(["contents", "transcriptions", "ocr"], async (storage) => {
      for (const record of targets) {
        await storage.put("contents", record);
        if (!changes.studyId) continue;
        const transcriptionKey = `transcription-${record.id}`;
        const transcription = await storage.get<Record<string, unknown>>("transcriptions", transcriptionKey);
        if (transcription) await storage.put("transcriptions", { ...transcription, studyId: changes.studyId });
        const ocrKey = `ocr-${record.id}`;
        const ocr = await storage.get<Record<string, unknown>>("ocr", ocrKey);
        if (ocr) await storage.put("ocr", { ...ocr, studyId: changes.studyId });
      }
    });
    window.dispatchEvent(new Event(EXTRACTION_UPDATE_EVENT));
  },

  async removeByFileId(fileId: string) {
    const store = await this.load();
    const targets = store.records.filter((record) => record.fileId === fileId);
    await StorageManager.transaction(["contents", "transcriptions", "ocr"], async (storage) => {
      for (const record of targets) {
        await storage.delete("contents", record.id);
        await storage.delete("transcriptions", `transcription-${record.id}`);
        await storage.delete("ocr", `ocr-${record.id}`);
      }
    });
    window.dispatchEvent(new Event(EXTRACTION_UPDATE_EVENT));
  },
};
