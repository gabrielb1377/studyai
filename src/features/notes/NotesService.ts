import type { StudyNote } from "@/types/note";

const STORAGE_KEY = "studyai:notes";

function isNoteList(value: unknown): value is StudyNote[] {
  return Array.isArray(value) && value.every((note) => typeof note === "object" && note !== null && typeof note.id === "string" && typeof note.studyId === "string" && typeof note.title === "string" && typeof note.content === "string" && typeof note.createdAt === "string" && typeof note.updatedAt === "string");
}

export const NotesService = {
  load(): StudyNote[] { if (typeof window === "undefined") return []; try { const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"); return isNoteList(value) ? value : []; } catch { return []; } },
  save(notes: StudyNote[]) { if (typeof window === "undefined") return; window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); window.dispatchEvent(new Event("studyai:notes-updated")); },
  create(studyId: string, now = new Date().toISOString()): StudyNote { return { id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, studyId, title: "Nova nota", content: "", createdAt: now, updatedAt: now }; },
  upsert(notes: readonly StudyNote[], note: StudyNote, now = new Date().toISOString()) { const next = { ...note, title: note.title.trim() || "Sem título", updatedAt: now }; return notes.some((item) => item.id === note.id) ? notes.map((item) => item.id === note.id ? next : item) : [next, ...notes]; },
  remove(notes: readonly StudyNote[], noteId: string) { return notes.filter((note) => note.id !== noteId); },
};
