"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionChangedError, SessionOperationManager } from "@/features/account/SessionOperationManager";
import { currentDatabaseGeneration, currentDatabaseName } from "@/lib/storage/Database";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import type { StudyNote } from "@/types/note";
import { NotesService } from "./NotesService";
import { LearningService } from "@/features/learning/LearningService";

export type NoteSaveStatus = "idle" | "saving" | "saved" | "error";

export function useNotes(studyId?: string) {
  const auth = useAuth();
  const runtimeSession = SessionOperationManager.current();
  const activeSession =
    !auth.isLoading &&
    !runtimeSession.suspended &&
    runtimeSession.userId &&
    (!auth.session?.user.id || auth.session.user.id === runtimeSession.userId)
      ? { userId: runtimeSession.userId, generation: runtimeSession.generation }
      : null;
  const activeSessionKey = activeSession ? `${activeSession.userId}:${activeSession.generation}` : null;

  const [allNotes, setAllNotes] = useState<StudyNote[]>([]);
  const [saveStatus, setSaveStatus] = useState<NoteSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const trackedSaves = useRef<Record<string, number>>({});
  const latestNotesRef = useRef<StudyNote[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  const reload = useCallback(async () => {
    const current = activeSessionRef.current;
    if (!current) {
      latestNotesRef.current = [];
      setAllNotes([]);
      setSaveStatus("idle");
      setSaveError(null);
      return;
    }

    let op: ReturnType<typeof SessionOperationManager.start>;
    try {
      op = SessionOperationManager.start(current.userId);
    } catch {
      return;
    }
    const dbGen = currentDatabaseGeneration();
    const dbName = currentDatabaseName();

    try {
      const loaded = await NotesService.load();
      op.assertCurrent();
      if (currentDatabaseGeneration() !== dbGen || currentDatabaseName() !== dbName) return;
      latestNotesRef.current = loaded;
      setAllNotes(loaded);
      setSaveError(null);
    } catch (error) {
      if (error instanceof SessionChangedError) return;
      try {
        op.assertCurrent();
      } catch {
        return;
      }
      setSaveStatus("error");
      setSaveError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar suas notas do armazenamento local.",
      );
    } finally {
      op.release();
    }
  }, []);

  useEffect(() => {
    latestNotesRef.current = [];
    setAllNotes([]);
    setSaveStatus("idle");
    setSaveError(null);
    trackedSaves.current = {};

    if (!activeSessionKey) return;
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener("studyai:notes-updated", handleReload);
    window.addEventListener(STORAGE_UPDATED_EVENT, handleReload);
    return () => {
      window.removeEventListener("studyai:notes-updated", handleReload);
      window.removeEventListener(STORAGE_UPDATED_EVENT, handleReload);
    };
  }, [activeSessionKey, reload]);

  const updateNotes = useCallback(
    (updater: (current: StudyNote[]) => StudyNote[]) => {
      const currentSession = activeSessionRef.current;
      if (!currentSession) return;
      let op: ReturnType<typeof SessionOperationManager.start>;
      try {
        op = SessionOperationManager.start(currentSession.userId);
      } catch {
        return;
      }
      const dbGen = currentDatabaseGeneration();
      const dbName = currentDatabaseName();

      const nextNotes = updater(latestNotesRef.current);
      latestNotesRef.current = nextNotes;
      setAllNotes(nextNotes);
      setSaveStatus("saving");
      setSaveError(null);

      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          // Validação estrita imediatamente antes da fronteira efetiva de escrita
          op.assertCurrent();
          if (currentDatabaseGeneration() !== dbGen || currentDatabaseName() !== dbName) {
            throw new SessionChangedError("O armazenamento mudou antes da gravação das notas.");
          }
          await NotesService.save(nextNotes);
          op.assertCurrent();
          if (currentDatabaseGeneration() !== dbGen || currentDatabaseName() !== dbName) {
            throw new SessionChangedError("O armazenamento mudou ao concluir a gravação das notas.");
          }
        })
        .then(() => {
          setSaveStatus("saved");
          setSaveError(null);
        })
        .catch((error) => {
          if (error instanceof SessionChangedError) return;
          try {
            op.assertCurrent();
          } catch {
            return;
          }
          setSaveStatus("error");
          setSaveError(
            error instanceof Error
              ? error.message
              : "Não foi possível salvar suas notas no armazenamento local.",
          );
        })
        .finally(() => op.release());
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
