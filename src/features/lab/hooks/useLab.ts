"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LabStorage } from "../storage/LabStorage";
import { LabService } from "../services/LabService";
import { LabAIService } from "../services/LabAIService";
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

  const active = projects.find((project) => project.id === activeId);

  const create = useCallback(async (input: CreateLabProjectInput) => {
    setError(undefined);
    const created = await LabService.create(input);
    setProjects((current) => [created, ...current]);
    setActiveId(created.id);
    startedRef.current = Date.now();
    return created;
  }, []);

  const openAcademy = useCallback(async (academyStudyId: string, contentId?: string) => {
    const existing = projects.find((project) => project.academyStudyId === academyStudyId && (!contentId || project.academyContentId === contentId));
    if (existing) { setActiveId(existing.id); return existing; }
    const created = await LabService.fromAcademy(academyStudyId, contentId);
    setProjects((current) => [created, ...current]);
    setActiveId(created.id);
    return created;
  }, [projects]);

  const update = useCallback((changes: Partial<LabProject>) => {
    if (!active) return;
    const next = { ...active, ...changes, updatedAt: new Date().toISOString() };
    setProjects((current) => current.map((project) => project.id === next.id ? next : project));
    if (saveTimer.current) clearTimeout(saveTimer.current);
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

  const run = useCallback(async () => {
    if (!active || isRunning) return;
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
    if (!active || isReviewing) return;
    setIsReviewing(true); setError(undefined);
    try {
      const feedback = await LabAIService.review(active);
      const latest = await LabStorage.get(active.id);
      const saved = await LabService.save({ ...(latest ?? active), feedback });
      setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
      return feedback;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível corrigir o exercício."); }
    finally { setIsReviewing(false); }
  }, [active, isReviewing]);

  const complete = useCallback(async () => {
    if (!active) return;
    const saved = await LabService.complete(active);
    setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
  }, [active]);

  const remove = useCallback(async (project: LabProject) => {
    await LabService.remove(project);
    setProjects((current) => current.filter((item) => item.id !== project.id));
    if (activeId === project.id) setActiveId(projects.find((item) => item.id !== project.id)?.id);
  }, [activeId, projects]);

  return { projects, studies, active, activeId, isLoading, isRunning, isReviewing, error, setActiveId, create, openAcademy, update, updateCode, changeLanguage, run, review, complete, remove };
}
