import type { CloudSyncState } from "@/features/account/types";

export const clientSyncEntities = ["documents", "contents", "chunks", "embeddings", "studies", "notes", "summaries", "flashcards", "quizzes", "transcriptions", "ocr", "knowledge", "metadata", "workspace", "mentor", "learning"] as const;
export type ClientSyncEntity = (typeof clientSyncEntities)[number];
export type ClientMutation = { entity: ClientSyncEntity; recordId: string; operation: "upsert" | "delete"; baseVersion: number; updatedAt: string; hash: string; data?: unknown; deviceId: string };
export type ClientCloudRecord = ClientMutation & { version: number; userId: string; sequence?: number };
export type ClientConflict = { id: string; entity: ClientSyncEntity; recordId: string; local: ClientMutation; remote: ClientCloudRecord; reason: string };
export type SyncManifest = Record<string, { hash: string; version: number }>;
export type SyncMetadata = { key: "cloud-sync:v1"; state: CloudSyncState; manifest: SyncManifest; queue: ClientMutation[]; conflicts: ClientConflict[]; fileManifest: Record<string, string>; updatedAt: string };

