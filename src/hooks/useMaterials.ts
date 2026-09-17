"use client";

import { useCallback, useEffect, useState } from "react";

import { MATERIALS_UPDATED_EVENT, MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setMaterials(await MaterialService.load());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const handleRefresh = () => { void refresh(); };
    window.addEventListener(MATERIALS_UPDATED_EVENT, handleRefresh);
    window.addEventListener("studyai:storage-updated", handleRefresh);

    return () => {
      window.removeEventListener(MATERIALS_UPDATED_EVENT, handleRefresh);
      window.removeEventListener("studyai:storage-updated", handleRefresh);
    };
  }, [refresh]);

  return { materials, isLoading, refresh };
}
