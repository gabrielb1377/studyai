import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import {
  extractionFileTypes,
  type ExtractedContent,
  type ExtractionMetadata,
  type ExtractionStatus,
  type ExtractionStore,
  ingestionStageIds,
} from "./ExtractionTypes";

const STORAGE_KEY = "studyai:extracted-content";
export const EXTRACTION_UPDATE_EVENT = "studyai:extraction-updated";
const EMPTY_STORE: ExtractionStore = { version: 1, records: [] };

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

function isMetadata(value: unknown): value is ExtractionMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<ExtractionMetadata>;
  return typeof metadata.name === "string" && typeof metadata.type === "string" &&
    typeof metadata.size === "number" &&
    isOptionalString(metadata.title) && isOptionalString(metadata.subject) &&
    isOptionalString(metadata.topic) && isOptionalStringList(metadata.subtopics) &&
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
    (content.error === undefined || typeof content.error === "string") && isPipelineData(content);
}

function isExtractionStore(value: unknown): value is ExtractionStore {
  if (typeof value !== "object" || value === null) return false;
  const store = value as Partial<ExtractionStore>;
  return store.version === 1 && Array.isArray(store.records) &&
    store.records.every(isExtractedContent);
}

export const ContentStorage = {
  load(): ExtractionStore {
    return readLocalStorage(STORAGE_KEY, isExtractionStore) ?? EMPTY_STORE;
  },

  save(store: ExtractionStore) {
    writeLocalStorage(STORAGE_KEY, store, EXTRACTION_UPDATE_EVENT);
  },

  upsert(record: ExtractedContent) {
    const store = this.load();
    const records = store.records.some((item) => item.id === record.id)
      ? store.records.map((item) => item.id === record.id ? record : item)
      : [record, ...store.records];
    this.save({ version: 1, records });
  },

  updateFile(fileId: string, changes: Partial<Pick<ExtractedContent, "studyId">> & { name?: string }) {
    const store = this.load();
    const records = store.records.map((record) => record.fileId === fileId
      ? {
          ...record,
          ...(changes.studyId ? { studyId: changes.studyId } : {}),
          metadata: changes.name
            ? { ...record.metadata, name: changes.name }
            : record.metadata,
        }
      : record,
    );
    this.save({ version: 1, records });
  },

  removeByFileId(fileId: string) {
    const store = this.load();
    this.save({
      version: 1,
      records: store.records.filter((record) => record.fileId !== fileId),
    });
  },
};
