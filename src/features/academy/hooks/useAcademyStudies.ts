"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AcademyService } from "../services/AcademyService";
import { ContentGeneratorService, type AcademyGenerationProgress } from "../services/ContentGeneratorService";
import { AcademyExportService } from "../services/AcademyExportService";
import { ACADEMY_UPDATED_EVENT } from "../storage/AcademyStorage";
import type { AcademyContentKind, AcademyExportKind, AcademyGeneratedContent, AcademyStudy, CreateAcademyStudyInput } from "../types";

export function useAcademyStudies() {
  const [studies, setStudies] = useState<AcademyStudy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [generatingStudyId, setGeneratingStudyId] = useState<string>();
  const [generationProgress, setGenerationProgress] = useState<AcademyGenerationProgress>();
  const generationController = useRef<AbortController | undefined>(undefined);
  const [exportingKind, setExportingKind] = useState<AcademyExportKind>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setStudies(await AcademyService.list());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus estudos livres.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(ACADEMY_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(ACADEMY_UPDATED_EVENT, refresh);
  }, [refresh]);

  const create = useCallback(async (input: CreateAcademyStudyInput) => {
    setIsCreating(true);
    setError(undefined);
    try {
      const result = await AcademyService.create(input);
      await refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o estudo livre.");
      throw cause;
    } finally {
      setIsCreating(false);
    }
  }, [refresh]);

  const generate = useCallback(async (study: AcademyStudy, kind: AcademyContentKind, force = false) => {
    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;
    setGeneratingStudyId(study.id);
    setGenerationProgress({ stage: "preparing", completedStages: 0, totalStages: 6, state: "generating" });
    setError(undefined);
    try {
      const result = await ContentGeneratorService.generate(study, kind, {
        force,
        onProgress: setGenerationProgress,
        signal: controller.signal,
      });
      await refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o conteúdo.");
      throw cause;
    } finally {
      setGeneratingStudyId(undefined);
      if (generationController.current === controller) generationController.current = undefined;
    }
  }, [refresh]);

  const cancelGeneration = useCallback(() => {
    generationController.current?.abort();
  }, []);

  const exportContent = useCallback(async (study: AcademyStudy, content: AcademyGeneratedContent, kind: AcademyExportKind) => {
    setExportingKind(kind);
    setError(undefined);
    try {
      const result = await AcademyExportService.export(study, content, kind);
      await refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exportar o conteúdo.");
      throw cause;
    } finally {
      setExportingKind(undefined);
    }
  }, [refresh]);

  return { studies, isLoading, isCreating, generatingStudyId, generationProgress, exportingKind, error, create, generate, cancelGeneration, exportContent, refresh };
}
