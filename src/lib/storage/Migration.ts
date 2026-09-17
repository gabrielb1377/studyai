import { IndexedDB } from "./IndexedDB";
import {
  STORAGE_MIGRATION_KEY,
  STORAGE_SCHEMA_VERSION,
  STORAGE_STORES,
  type StorageStoreName,
} from "./StorageVersion";

type MetadataRecord = { key: string; value: unknown; updatedAt: string };
type LegacyDefinition = {
  keys: string[];
  store: StorageStoreName;
  select: (value: unknown) => unknown[];
};

const array = (value: unknown) => Array.isArray(value) ? value : [];
const property = (name: string) => (value: unknown) => {
  if (typeof value !== "object" || value === null) return [];
  return array((value as Record<string, unknown>)[name]);
};

const definitions: LegacyDefinition[] = [
  { keys: ["studyai:materials"], store: "documents", select: property("materials") },
  { keys: ["studyai:extracted-content"], store: "contents", select: property("records") },
  { keys: ["studyai:content-chunks"], store: "chunks", select: property("chunks") },
  { keys: ["studyai:embeddings"], store: "embeddings", select: property("embeddings") },
  { keys: ["studyai:study-engine:v2", "studyai:study-engine"], store: "studies", select: array },
  { keys: ["studyai:notes"], store: "notes", select: array },
  { keys: ["studyai:summaries"], store: "summaries", select: array },
  { keys: ["studyai:flashcards"], store: "flashcards", select: array },
];

function parse(key: string) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function quizRecords(value: unknown) {
  if (typeof value !== "object" || value === null) return [];
  const store = value as { questions?: unknown; results?: unknown };
  return [
    ...array(store.questions).map((question) => ({ ...(question as object), kind: "question" })),
    ...array(store.results).map((result) => ({ ...(result as object), kind: "result" })),
  ];
}

function metadataRecords() {
  const now = new Date().toISOString();
  const conversations = parse("studyai:tutor-conversations:v2") ?? parse("studyai:tutor-conversations");
  return conversations === undefined
    ? []
    : [{ key: "tutor-conversations", value: conversations, updatedAt: now } satisfies MetadataRecord];
}

export const Migration = {
  async run() {
    if (typeof window === "undefined") return;
    const current = await IndexedDB.transaction(["metadata"], "readonly", (storage) =>
      storage.get<MetadataRecord>("metadata", STORAGE_MIGRATION_KEY),
    );
    if (current?.value === STORAGE_SCHEMA_VERSION) return;

    const legacy = definitions.flatMap((definition) => definition.keys.flatMap((key) => {
      const value = parse(key);
      return value === undefined ? [] : [{ definition, key, records: definition.select(value) }];
    }));
    const quizValue = parse("studyai:quizzes");
    const now = new Date().toISOString();

    await IndexedDB.transaction(STORAGE_STORES, "readwrite", async (storage) => {
      for (const entry of legacy) {
        for (const [index, record] of entry.records.entries()) {
          await storage.put(
            entry.definition.store,
            typeof record === "object" && record !== null ? { ...record, _storageOrder: index } : record,
          );
        }
      }
      if (quizValue !== undefined) {
        for (const [index, record] of quizRecords(quizValue).entries()) {
          await storage.put("quizzes", { ...record, _storageOrder: index });
        }
      }
      const contents = legacy.filter((entry) => entry.definition.store === "contents").flatMap((entry) => entry.records);
      for (const value of contents) {
        if (typeof value !== "object" || value === null) continue;
        const content = value as Record<string, unknown>;
        if (content.transcription) {
          await storage.put("transcriptions", {
            id: `transcription-${content.id}`,
            fileId: content.fileId,
            studyId: content.studyId,
            value: content.transcription,
            updatedAt: now,
          });
        }
        const metadata = content.metadata as Record<string, unknown> | undefined;
        if (metadata?.ocrPerformed) {
          await storage.put("ocr", {
            id: `ocr-${content.id}`,
            fileId: content.fileId,
            studyId: content.studyId,
            text: content.extractedText,
            confidence: metadata.ocrConfidence,
            updatedAt: now,
          });
        }
      }
      for (const record of metadataRecords()) await storage.put("metadata", record);
      await storage.put("metadata", {
        key: STORAGE_MIGRATION_KEY,
        value: STORAGE_SCHEMA_VERSION,
        updatedAt: now,
      } satisfies MetadataRecord);
    });

    const migratedKeys = new Set([
      ...legacy.map((entry) => entry.key),
      "studyai:quizzes",
      "studyai:tutor-conversations:v2",
      "studyai:tutor-conversations",
    ]);
    migratedKeys.forEach((key) => window.localStorage.removeItem(key));
  },
};
