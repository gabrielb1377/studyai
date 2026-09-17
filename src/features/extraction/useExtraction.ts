"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ContentStorage, EXTRACTION_UPDATE_EVENT } from "./ContentStorage";
import type { ExtractedContent } from "./ExtractionTypes";

export function useExtraction() {
  const [records, setRecords] = useState<ExtractedContent[]>([]);
  const [isReady, setIsReady] = useState(false);
  const reload = useCallback(async () => {
    setRecords((await ContentStorage.load()).records);
    setIsReady(true);
  }, []);

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener(EXTRACTION_UPDATE_EVENT, handleReload);
    return () => window.removeEventListener(EXTRACTION_UPDATE_EVENT, handleReload);
  }, [reload]);

  const statistics = useMemo(() => ({
    total: records.length,
    processing: records.filter((record) => record.status === "processing").length,
    extracted: records.filter((record) => record.status === "extracted").length,
    errors: records.filter((record) => record.status === "error").length,
    ocr: records.filter((record) => record.metadata.ocrPerformed).length,
    transcriptions: records.filter((record) => record.metadata.transcriptionPerformed).length,
    processingTimeMs: records.reduce(
      (total, record) => total + (record.metadata.processingTimeMs ?? 0),
      0,
    ),
  }), [records]);

  return { records, statistics, isReady };
}
