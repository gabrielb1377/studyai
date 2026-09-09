import type { TutorConversation } from "@/types/tutor";

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
    if (typeof window === "undefined") return null;

    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      if (!rawValue) return null;
      const parsedValue: unknown = JSON.parse(rawValue);
      return isConversationList(parsedValue) ? parsedValue : null;
    } catch {
      return null;
    }
  },

  save(conversations: readonly TutorConversation[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  },

  clear() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
  },
};
