"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MATERIALS_UPDATED_EVENT, MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async (options: { clear?: boolean } = {}) => {
    const version = ++requestVersion.current;
    if (options.clear) setMaterials([]);
    setError(null);
    if (options.clear) setIsLoading(true);
    try {
      const loaded = await MaterialService.load();
      if (version !== requestVersion.current) return;
      setMaterials(loaded);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setMaterials([]);
      setError(cause instanceof Error ? cause : new Error("Não foi possível carregar os materiais."));
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh({ clear: true });
    const handleRefresh = () => { void refresh(); };
    const handleStorageRefresh = (event: Event) => {
      const scopeChanged = event instanceof CustomEvent && Boolean(event.detail?.scopeChanged);
      void refresh({ clear: scopeChanged });
    };
    window.addEventListener(MATERIALS_UPDATED_EVENT, handleRefresh);
    window.addEventListener("studyai:storage-updated", handleStorageRefresh);

    return () => {
      requestVersion.current += 1;
      window.removeEventListener(MATERIALS_UPDATED_EVENT, handleRefresh);
      window.removeEventListener("studyai:storage-updated", handleStorageRefresh);
    };
  }, [refresh]);

  return { materials, isLoading, error, refresh };
}
