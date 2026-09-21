"use client";

import { useCallback, useEffect, useState } from "react";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import { KNOWLEDGE_UPDATED_EVENT, KnowledgeStorage } from "./KnowledgeStorage";
import type { KnowledgeGraph } from "./types";

export function useKnowledgeGraphs(studyId?: string) {
  const [graphs, setGraphs] = useState<KnowledgeGraph[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refresh = useCallback(async () => {
    const records = studyId ? await KnowledgeStorage.getByStudyId(studyId) : await KnowledgeStorage.load();
    setGraphs(records);
    setIsLoading(false);
  }, [studyId]);
  useEffect(() => {
    void refresh();
    const onStorage = (event: Event) => {
      if (event.type === KNOWLEDGE_UPDATED_EVENT || (event as CustomEvent<{ store?: string }>).detail?.store === "knowledge") void refresh();
    };
    window.addEventListener(KNOWLEDGE_UPDATED_EVENT, onStorage);
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorage);
    return () => {
      window.removeEventListener(KNOWLEDGE_UPDATED_EVENT, onStorage);
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStorage);
    };
  }, [refresh]);
  return { graphs, isLoading, refresh };
}
