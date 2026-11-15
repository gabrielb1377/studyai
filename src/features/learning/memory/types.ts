export type MemoryCategory =
  | "preference"
  | "goal"
  | "difficulty"
  | "continuity"
  | "milestone";

export type MemorySource = "explicit" | "session";

export type ExplanationLevel =
  | "basic"
  | "intermediate"
  | "advanced"
  | "technical";

export type LongTermMemoryEntry = {
  id: string;
  dedupeKey?: string;
  category: MemoryCategory;
  source: MemorySource;
  studyId?: string;
  studyTitle?: string;
  subject?: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  sourceUnavailable?: boolean;
};

export type LongTermMemorySettings = {
  enabled: boolean;
  explanationLevel?: ExplanationLevel;
};

export type LongTermMemoryStoreState = {
  settings: LongTermMemorySettings;
  entries: LongTermMemoryEntry[];
};

export type CreateMemoryInput = {
  dedupeKey?: string;
  category: MemoryCategory;
  source: MemorySource;
  studyId?: string;
  studyTitle?: string;
  subject?: string;
  title: string;
  content: string;
  expiresAt?: string;
};
