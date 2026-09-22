export const syncEntities = ["documents", "contents", "chunks", "embeddings", "studies", "notes", "summaries", "flashcards", "quizzes", "transcriptions", "ocr", "knowledge", "metadata", "workspace", "mentor", "learning"] as const;
export type SyncEntity = (typeof syncEntities)[number];

export type SyncMutation = {
  entity: SyncEntity;
  recordId: string;
  operation: "upsert" | "delete";
  baseVersion: number;
  updatedAt: string;
  hash: string;
  data?: unknown;
  deviceId: string;
};

export type CloudRecord = SyncMutation & { version: number; userId: string; sequence?: number };
export type SyncConflict = { id: string; entity: SyncEntity; recordId: string; local: SyncMutation; remote: CloudRecord; reason: string };

export type CloudUser = { id: string; email: string; passwordHash: string; emailVerifiedAt?: string; createdAt: string; updatedAt: string };
export type UserProfile = { userId: string; name: string; photoUrl?: string; language: string; theme: string; preferences: Record<string, unknown>; updatedAt: string };
export type DeviceSession = { id: string; userId: string; tokenHash: string; deviceId: string; deviceName: string; expiresAt: string; lastUsedAt: string; revokedAt?: string };
export type Backup = { id: string; userId: string; payload: CloudRecord[]; sizeBytes: number; createdAt: string };
export type Share = { id: string; userId: string; token: string; entity: SyncEntity; recordId: string; expiresAt?: string; revokedAt?: string; createdAt: string };

