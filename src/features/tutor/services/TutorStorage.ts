import type { TutorConversation } from "@/types/tutor";
import { StorageManager } from "@/lib/storage/StorageManager";

const STORAGE_KEY = "tutor-conversations";
type MetadataRecord = { key: string; value: unknown; updatedAt: string };

function isConversationList(value: unknown): value is TutorConversation[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === "object" && item !== null &&
    typeof item.id === "string" && typeof item.title === "string" &&
    Array.isArray(item.messages) && typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string",
  );
}

export const TutorStorage = {
  async load(): Promise<TutorConversation[] | null> {
    const record = await StorageManager.get<MetadataRecord>("metadata", STORAGE_KEY);
    return isConversationList(record?.value) ? record.value : null;
  },

  async save(conversations: readonly TutorConversation[]) {
    await StorageManager.put("metadata", {
      key: STORAGE_KEY,
      value: conversations,
      updatedAt: new Date().toISOString(),
    } satisfies MetadataRecord);
  },

  async clear() {
    await StorageManager.delete("metadata", STORAGE_KEY);
  },
};
