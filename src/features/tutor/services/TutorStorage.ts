import type { TutorConversation } from "@/types/tutor";
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "@/lib/local-storage";

const STORAGE_KEY = "studyai:tutor-conversations";

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
    return readLocalStorage(STORAGE_KEY, isConversationList);
  },

  save(conversations: readonly TutorConversation[]) {
    writeLocalStorage(STORAGE_KEY, conversations);
  },

  clear() {
    removeLocalStorage(STORAGE_KEY);
  },
};
