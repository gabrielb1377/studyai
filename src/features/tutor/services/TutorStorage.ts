import type { TutorConversation } from "@/types/tutor";
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "@/lib/local-storage";

const STORAGE_KEY = "studyai:tutor-conversations:v2";
const LEGACY_STORAGE_KEY = "studyai:tutor-conversations";

function isConversationList(value: unknown): value is TutorConversation[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === "object" && item !== null &&
    typeof item.id === "string" && typeof item.title === "string" &&
    Array.isArray(item.messages) && typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string",
  );
}

export const TutorStorage = {
  load(): TutorConversation[] | null {
    const current = readLocalStorage(STORAGE_KEY, isConversationList);
    if (current) return current;

    const legacy = readLocalStorage(LEGACY_STORAGE_KEY, isConversationList) ?? [];
    const userConversations = legacy.filter((conversation) => conversation.id.startsWith("conversation-"));
    removeLocalStorage(LEGACY_STORAGE_KEY);
    if (userConversations.length > 0) this.save(userConversations);
    return userConversations.length > 0 ? userConversations : null;
  },

  save(conversations: readonly TutorConversation[]) {
    writeLocalStorage(STORAGE_KEY, conversations);
  },

  clear() {
    removeLocalStorage(STORAGE_KEY);
    removeLocalStorage(LEGACY_STORAGE_KEY);
  },
};
