"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudyNote } from "@/types/note";
import { NotesService } from "./NotesService";
import { LearningService } from "@/features/learning/LearningService";

export type NoteSaveStatus = "idle" | "saving" | "saved" | "error";

export function useNotes(studyId?: string) {
  const [allNotes, setAllNotes] = useState<StudyNote[]>([]);
  const [saveStatus, setSaveStatus] = useState<NoteSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const trackedSaves = useRef<Record<string, number>>({});
  const latestNotesRef = useRef<StudyNote[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const reload = useCallback(async () => {
    try {
      const loaded = await NotesService.load();
      latestNotesRef.current = loaded;
      setAllNotes(loaded);
      setSaveError(null);
    } catch (error) {
      setSaveStatus("error");
      setSaveError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar suas notas do armazenamento local.",
      );
    }
  }, []);

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener("studyai:notes-updated", handleReload);
    return () => window.removeEventListener("studyai:notes-updated", handleReload);
  }, [reload]);

  const updateNotes = useCallback(
    (updater: (current: StudyNote[]) => StudyNote[]) => {
      const nextNotes = updater(latestNotesRef.current);
      latestNotesRef.current = nextNotes;
      setAllNotes(nextNotes);
      setSaveStatus("saving");
      setSaveError(null);
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => NotesService.save(nextNotes))
        .then(() => {
          setSaveStatus("saved");
          setSaveError(null);
        })
        .catch((error) => {
          setSaveStatus("error");
          setSaveError(
            error instanceof Error
              ? error.message
              : "Não foi possível salvar suas notas no armazenamento local.",
          );
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
    saveStatus,
    saveError,
  };
}
