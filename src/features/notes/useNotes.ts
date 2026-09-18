"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudyNote } from "@/types/note";
import { NotesService } from "./NotesService";
import { LearningService } from "@/features/learning/LearningService";

export function useNotes(studyId?: string) {
  const [allNotes, setAllNotes] = useState<StudyNote[]>([]);
  const trackedSaves = useRef<Record<string, number>>({});
  const reload = useCallback(async () => setAllNotes(await NotesService.load()), []);

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener("studyai:notes-updated", handleReload);
    return () => window.removeEventListener("studyai:notes-updated", handleReload);
  }, [reload]);

  const updateNotes = useCallback(
    (updater: (current: StudyNote[]) => StudyNote[]) => {
      setAllNotes((current) => {
        const nextNotes = updater(current);
        void NotesService.save(nextNotes);
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
    trackedSaves.current[note.id] = Date.now();
    LearningService.enqueueActivity({ type: "note", studyId: nextStudyId });
    return note;
  };
  const save = useCallback(
    (note: StudyNote) => {
      updateNotes((current) => NotesService.upsert(current, note));
      const lastTracked = trackedSaves.current[note.id] ?? 0;
      if (Date.now() - lastTracked >= 300_000) {
        trackedSaves.current[note.id] = Date.now();
        LearningService.enqueueActivity({ type: "note", studyId: note.studyId });
      }
    },
    [updateNotes],
  );
  const remove = useCallback(
    (noteId: string) => updateNotes((current) => NotesService.remove(current, noteId)),
    [updateNotes],
  );

  return {
    notes,
    create,
    save,
    remove,
  };
}
