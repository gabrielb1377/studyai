import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import {
  extractionFileTypes,
  type ExtractedContent,
  type ExtractionMetadata,
  type ExtractionStatus,
  type ExtractionStore,
} from "./ExtractionTypes";

const STORAGE_KEY = "studyai:extracted-content";
export const EXTRACTION_UPDATE_EVENT = "studyai:extraction-updated";
const EMPTY_STORE: ExtractionStore = { version: 1, records: [] };

function isStatus(value: unknown): value is ExtractionStatus {
  return value === "processing" || value === "extracted" || value === "error";
}

function isMetadata(value: unknown): value is ExtractionMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<ExtractionMetadata>;
  return typeof metadata.name === "string" && typeof metadata.type === "string" &&
    typeof metadata.size === "number" &&
    (metadata.pageCount === undefined || typeof metadata.pageCount === "number") &&
    (metadata.duration === undefined || typeof metadata.duration === "number") &&
    (metadata.language === undefined || typeof metadata.language === "string") &&
    (metadata.width === undefined || typeof metadata.width === "number") &&
    (metadata.height === undefined || typeof metadata.height === "number");
}

function isExtractedContent(value: unknown): value is ExtractedContent {
  if (typeof value !== "object" || value === null) return false;
  const content = value as Partial<ExtractedContent>;
  return typeof content.id === "string" && typeof content.studyId === "string" &&
    typeof content.fileId === "string" &&
    extractionFileTypes.includes(content.fileType as typeof extractionFileTypes[number]) &&
    typeof content.extractedText === "string" && isMetadata(content.metadata) &&
    isStatus(content.status) && typeof content.createdAt === "string" &&
    (content.error === undefined || typeof content.error === "string");
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
};
