"use client";

import { useCallback, useEffect, useState } from "react";
import { AcademyService } from "../services/AcademyService";
import { ACADEMY_UPDATED_EVENT } from "../storage/AcademyStorage";
import type { AcademyStudy, CreateAcademyStudyInput } from "../types";

export function useAcademyStudies() {
  const [studies, setStudies] = useState<AcademyStudy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
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

  return { studies, isLoading, isCreating, error, create, refresh };
}
