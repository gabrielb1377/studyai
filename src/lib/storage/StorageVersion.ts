export const STORAGE_DATABASE_NAME = "studyai-db";
export const STORAGE_DATABASE_VERSION = 1;
export const STORAGE_SCHEMA_VERSION = 1;
export const STORAGE_MIGRATION_KEY = "storage-migration";

export const STORAGE_STORES = [
  "documents",
  "contents",
  "chunks",
  "embeddings",
  "studies",
  "notes",
  "summaries",
  "flashcards",
  "quizzes",
  "transcriptions",
  "ocr",
  "metadata",
] as const;

export type StorageStoreName = (typeof STORAGE_STORES)[number];
