import type { StudyNote } from "@/types/note";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";

const STORAGE_KEY = "studyai:notes";
const UPDATE_EVENT = "studyai:notes-updated";

function isNoteList(value: unknown): value is StudyNote[] {
  return Array.isArray(value) && value.every((note) =>
    typeof note === "object" && note !== null &&
    typeof note.id === "string" && typeof note.studyId === "string" &&
    typeof note.title === "string" && typeof note.content === "string" &&
    typeof note.createdAt === "string" && typeof note.updatedAt === "string",
  );
}

export const NotesService = {
  load(): StudyNote[] {
    return readLocalStorage(STORAGE_KEY, isNoteList) ?? [];
  },

  save(notes: readonly StudyNote[]) {
    writeLocalStorage(STORAGE_KEY, notes, UPDATE_EVENT);
  },

  create(studyId: string, now = new Date().toISOString()): StudyNote {
    return {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studyId,
      title: "Nova nota",
      content: "",
      createdAt: now,
      updatedAt: now,
    };
  },

  upsert(
    notes: readonly StudyNote[],
    note: StudyNote,
    now = new Date().toISOString(),
  ) {
    const nextNote = {
      ...note,
      title: note.title.trim() || "Sem título",
      updatedAt: now,
    };

    return notes.some((item) => item.id === note.id)
      ? notes.map((item) => item.id === note.id ? nextNote : item)
      : [nextNote, ...notes];
  },

  remove(notes: readonly StudyNote[], noteId: string) {
    return notes.filter((note) => note.id !== noteId);
  },
};
