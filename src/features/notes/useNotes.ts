"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudyNote } from "@/types/note";
import { NotesService } from "./NotesService";

export function useNotes(studyId?: string) {
  const [allNotes, setAllNotes] = useState<StudyNote[]>([]);
  const reload = useCallback(() => setAllNotes(NotesService.load()), []);

  useEffect(() => {
    reload();
    window.addEventListener("studyai:notes-updated", reload);
    return () => window.removeEventListener("studyai:notes-updated", reload);
  }, [reload]);

  const updateNotes = useCallback(
    (updater: (current: StudyNote[]) => StudyNote[]) => {
      setAllNotes((current) => {
        const nextNotes = updater(current);
        NotesService.save(nextNotes);
        return nextNotes;
      });
    },
    [],
  );

  const notes = useMemo(
    () => studyId ? allNotes.filter((note) => note.studyId === studyId) : allNotes,
    [allNotes, studyId],
  );

  const create = (nextStudyId: string) => {
    const note = NotesService.create(nextStudyId);
    updateNotes((current) => [note, ...current]);
    return note;
  };

  return {
    notes,
    create,
    save: (note: StudyNote) =>
      updateNotes((current) => NotesService.upsert(current, note)),
    remove: (noteId: string) =>
      updateNotes((current) => NotesService.remove(current, noteId)),
  };
}
