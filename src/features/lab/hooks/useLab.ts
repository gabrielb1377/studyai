"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LabStorage } from "../storage/LabStorage";
import { LabService } from "../services/LabService";
import { isLabAIRateLimitError, LabAIService } from "../services/LabAIService";
import { SafeExecutionService } from "../services/SafeExecutionService";
import { SqlLabSession } from "../services/SqlLabService";
import type { CreateLabProjectInput, LabLanguage, LabProject } from "../types";
import type { StudyRecord } from "@/types/study-engine";

export function useLab(options: { studyId?: string } = {}) {
  const [projects, setProjects] = useState<LabProject[]>([]);
  const [studies, setStudies] = useState<StudyRecord[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string>();
  const [isReviewRateLimited, setIsReviewRateLimited] = useState(false);
  const [reviewCooldownSeconds, setReviewCooldownSeconds] = useState(0);
  const sqlRef = useRef(new SqlLabSession());
  const startedRef = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [nextProjects, nextStudies] = await Promise.all([LabStorage.list(), LabService.studies()]);
    const filtered = options.studyId ? nextProjects.filter((project) => project.studyId === options.studyId) : nextProjects;
    setProjects(filtered);
    setStudies(nextStudies);
    setActiveId((current) => filtered.some((project) => project.id === current) ? current : filtered[0]?.id);
    setIsLoading(false);
  }, [options.studyId]);

  useEffect(() => {
    void refresh().catch((cause) => { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o Laboratório."); setIsLoading(false); });
  }, [refresh]);

  useEffect(() => () => { sqlRef.current.dispose(); if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  useEffect(() => {
    if (reviewCooldownSeconds <= 0) return;
    const timer = setTimeout(() => setReviewCooldownSeconds((current) => Math.max(0, current - 1)), 1_000);
    return () => clearTimeout(timer);
  }, [reviewCooldownSeconds]);

  const active = projects.find((project) => project.id === activeId);

  const selectProject = useCallback((id: string | undefined) => {
    setActiveId(id);
    startedRef.current = Date.now();
  }, []);

  const clearPendingSave = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
  };

  const create = useCallback(async (input: CreateLabProjectInput) => {
    setError(undefined);
    clearPendingSave();
    const created = await LabService.create(input);
    setProjects((current) => [created, ...current]);
    setActiveId(created.id);
    startedRef.current = Date.now();
    return created;
  }, []);

  const openAcademy = useCallback(async (academyStudyId: string, contentId?: string) => {
    const existing = projects.find((project) => project.academyStudyId === academyStudyId && (!contentId || project.academyContentId === contentId));
    if (existing) { setActiveId(existing.id); startedRef.current = Date.now(); return existing; }
    const created = await LabService.fromAcademy(academyStudyId, contentId);
    setProjects((current) => [created, ...current]);
    setActiveId(created.id);
    startedRef.current = Date.now();
    return created;
  }, [projects]);

  const update = useCallback((changes: Partial<LabProject>) => {
    if (!active) return;
    const next = { ...active, ...changes, updatedAt: new Date().toISOString() };
    setProjects((current) => current.map((project) => project.id === next.id ? next : project));
    clearPendingSave();
    saveTimer.current = setTimeout(() => { void LabService.save(next); }, 450);
  }, [active]);

  const updateCode = useCallback((code: string) => {
    if (!active) return;
    update({ files: { ...active.files, [active.language]: code } });
  }, [active, update]);

  const changeLanguage = useCallback((language: LabLanguage) => {
    if (!active) return;
    update({ language, files: { ...active.files, [language]: active.files[language] ?? LabService.template(language) }, exercise: { ...active.exercise, language } });
    sqlRef.current.reset();
  }, [active, update]);

  const resetCode = useCallback(async () => {
    if (!active) return;
    clearPendingSave();
    const starter = active.language === active.exercise.language && active.exercise.starterCode
      ? active.exercise.starterCode
      : LabService.template(active.language);
    const next: LabProject = {
      ...active,
      files: { ...active.files, [active.language]: starter },
      updatedAt: new Date().toISOString(),
    };
    setProjects((current) => current.map((project) => project.id === next.id ? next : project));
    const saved = await LabService.save(next);
    setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
  }, [active]);

  const toggleStep = useCallback(async (stepId: string) => {
    if (!active || !active.exercise.steps?.length) return;
    clearPendingSave();
    const steps = active.exercise.steps.map((step) => step.id === stepId ? { ...step, done: !step.done } : step);
    const next: LabProject = {
      ...active,
      exercise: { ...active.exercise, steps },
      updatedAt: new Date().toISOString(),
    };
    setProjects((current) => current.map((project) => project.id === next.id ? next : project));
    const saved = await LabService.save(next);
    setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
  }, [active]);

  const run = useCallback(async () => {
    if (!active || isRunning) return;
    clearPendingSave();
    setIsRunning(true); setError(undefined);
    try {
      const code = active.files[active.language] ?? "";
      const result = active.language === "sql" ? await sqlRef.current.execute(code) : await SafeExecutionService.run(active.language, code);
      const practicedSeconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1_000));
      const saved = await LabService.recordExecution(active, result, practicedSeconds);
      setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
      startedRef.current = Date.now();
      return result;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível executar o código."); }
    finally { setIsRunning(false); }
  }, [active, isRunning]);

  const review = useCallback(async () => {
    if (!active || isReviewing || reviewCooldownSeconds > 0) return;
    clearPendingSave();
    setIsReviewing(true); setError(undefined); setIsReviewRateLimited(false);
    try {
      const feedback = await LabAIService.review(active);
      const latest = await LabStorage.get(active.id);
      const saved = await LabService.save({ ...(latest ?? active), files: active.files, feedback });
      setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
      setReviewCooldownSeconds(0);
      return feedback;
    } catch (cause) {
      if (isLabAIRateLimitError(cause)) {
        setIsReviewRateLimited(true);
        setReviewCooldownSeconds(Math.max(1, Math.ceil(cause.retryAfterMs / 1_000)));
      }
      setError(cause instanceof Error ? cause.message : "Não foi possível corrigir o exercício.");
    }
    finally { setIsReviewing(false); }
  }, [active, isReviewing, reviewCooldownSeconds]);

  const complete = useCallback(async () => {
    if (!active) return;
    clearPendingSave();
    const saved = await LabService.complete(active);
    setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
  }, [active]);

  const remove = useCallback(async (project: LabProject) => {
    clearPendingSave();
    await LabService.remove(project);
    setProjects((current) => current.filter((item) => item.id !== project.id));
    if (activeId === project.id) selectProject(projects.find((item) => item.id !== project.id)?.id);
  }, [activeId, projects, selectProject]);

  return { projects, studies, active, activeId, isLoading, isRunning, isReviewing, error, isReviewRateLimited, reviewCooldownSeconds, setActiveId: selectProject, create, openAcademy, update, updateCode, changeLanguage, resetCode, toggleStep, run, review, complete, remove };
}
