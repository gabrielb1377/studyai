"use client";

import { useCallback, useEffect, useState } from "react";
import { ContentStorage, EXTRACTION_UPDATE_EVENT } from "../extraction/ContentStorage";
import type { ExtractedContent } from "../extraction/ExtractionTypes";

export function useExtractionRecord(fileId?: string) {
  const [record, setRecord] = useState<ExtractedContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!fileId) {
      setRecord(null);
      setIsLoading(false);
      return;
    }
    try {
      const stored = await ContentStorage.load();
      setRecord(stored.records.find((item) => item.fileId === fileId) ?? null);
      setError(null);
    } catch {
      setError("Não foi possível carregar o conteúdo extraído deste material.");
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    void reload();
    const handleUpdate = () => { void reload(); };
    window.addEventListener(EXTRACTION_UPDATE_EVENT, handleUpdate);
    return () => window.removeEventListener(EXTRACTION_UPDATE_EVENT, handleUpdate);
  }, [reload]);

  return { record, isLoading, error, reload, setRecord };
}
