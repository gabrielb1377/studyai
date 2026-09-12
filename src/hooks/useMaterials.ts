"use client";

import { useCallback, useEffect, useState } from "react";

import { MATERIALS_UPDATED_EVENT, MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setMaterials(MaterialService.load());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(MATERIALS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(MATERIALS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { materials, isLoading, refresh };
}
