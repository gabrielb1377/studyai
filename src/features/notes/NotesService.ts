import type { StudyNote } from "@/types/note";
import { StorageManager } from "@/lib/storage/StorageManager";

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
  async load(): Promise<StudyNote[]> {
    const notes = await StorageManager.getAll<unknown>("notes");
    return isNoteList(notes)
      ? notes.sort((left, right) => ((left as StudyNote & { _storageOrder?: number })._storageOrder ?? Number.MAX_SAFE_INTEGER) -
        ((right as StudyNote & { _storageOrder?: number })._storageOrder ?? Number.MAX_SAFE_INTEGER))
      : [];
  },

  async save(notes: readonly StudyNote[]) {
    await StorageManager.replaceAll("notes", notes.map((note, index) => ({ ...note, _storageOrder: index })));
    window.dispatchEvent(new Event(UPDATE_EVENT));
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
