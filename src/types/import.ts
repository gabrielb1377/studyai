import type { ExtractionErrorDetails, IngestionStageId } from "@/features/extraction/ExtractionTypes";

export type ImportFileStatus = "uploaded" | "processing" | "complete" | "error";

export type ImportFile = {
  id: string;
  file: File;
  extension: string;
  progress: number;
  status: ImportFileStatus;
  stage?: IngestionStageId;
  message?: string;
  errorDetails?: ExtractionErrorDetails;
};

export type ImportPhase = "idle" | "processing" | "complete";
