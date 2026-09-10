"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ContentStorage, EXTRACTION_UPDATE_EVENT } from "./ContentStorage";
import type { ExtractedContent } from "./ExtractionTypes";

export function useExtraction() {
  const [records, setRecords] = useState<ExtractedContent[]>([]);
  const [isReady, setIsReady] = useState(false);
  const reload = useCallback(() => {
    setRecords(ContentStorage.load().records);
    setIsReady(true);
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(EXTRACTION_UPDATE_EVENT, reload);
    return () => window.removeEventListener(EXTRACTION_UPDATE_EVENT, reload);
  }, [reload]);

  const statistics = useMemo(() => ({
    total: records.length,
    processing: records.filter((record) => record.status === "processing").length,
    extracted: records.filter((record) => record.status === "extracted").length,
    errors: records.filter((record) => record.status === "error").length,
  }), [records]);

  return { records, statistics, isReady };
}
