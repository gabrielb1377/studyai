"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudyNote } from "@/types/note";
import { NotesService } from "./NotesService";

export function useNotes(studyId?: string) {
  const [allNotes, setAllNotes] = useState<StudyNote[]>([]);
  const reload = useCallback(() => setAllNotes(NotesService.load()), []);
  useEffect(() => { reload(); window.addEventListener("studyai:notes-updated", reload); return () => window.removeEventListener("studyai:notes-updated", reload); }, [reload]);
  const update = useCallback((updater: (current: StudyNote[]) => StudyNote[]) => setAllNotes((current) => { const next = updater(current); NotesService.save(next); return next; }), []);
  const notes = useMemo(() => studyId ? allNotes.filter((note) => note.studyId === studyId) : allNotes, [allNotes, studyId]);
  return { notes, create: (id: string) => { const note = NotesService.create(id); update((current) => [note, ...current]); return note; }, save: (note: StudyNote) => update((current) => NotesService.upsert(current, note)), remove: (noteId: string) => update((current) => NotesService.remove(current, noteId)) };
}
