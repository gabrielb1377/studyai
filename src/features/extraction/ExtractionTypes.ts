import type { StudyChapter } from "@/types/study-engine";

export const extractionFileTypes = [
  "pdf",
  "docx",
  "pptx",
  "txt",
  "mp3",
  "wav",
  "m4a",
  "mp4",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export type ExtractionFileType = (typeof extractionFileTypes)[number];
export type ExtractionStatus = "processing" | "extracted" | "error";

export const ingestionStageIds = [
  "document",
  "extraction",
  "ocr",
  "normalization",
  "analysis",
  "study",
  "chunks",
  "embeddings",
  "indexed",
] as const;

export type IngestionStageId = (typeof ingestionStageIds)[number];
export type IngestionStageStatus = "pending" | "processing" | "completed" | "skipped" | "error";

export type IngestionStage = {
  id: IngestionStageId;
  status: IngestionStageStatus;
  message?: string;
  startedAt?: string;
  completedAt?: string;
};

export type IngestionLog = {
  id: string;
  stage: IngestionStageId;
  status: Exclude<IngestionStageStatus, "pending">;
  message: string;
  createdAt: string;
};

export type ExtractionErrorDetails = {
  reason: string;
  fileName: string;
  stage: IngestionStageId;
  simplifiedStack?: string;
  suggestedAction: string;
};

export type DocumentSectionType =
  | "title"
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "header"
  | "footer"
  | "note"
  | "slide";

export type DocumentSection = {
  type: DocumentSectionType;
  text: string;
  level?: number;
  page?: number;
  slide?: number;
};

export type TranscriptionSegment = {
  start: number;
  end: number;
  text: string;
  confidence?: number;
};

export type MediaChapter = {
  title: string;
  start: number;
  end: number;
};

export type ExtractionMetadata = {
  name: string;
  type: string;
  size: number;
  title?: string;
  subject?: string;
  topic?: string;
  subtopics?: string[];
  keywords?: string[];
  summaryPreview?: string;
  pageCount?: number;
  duration?: number;
  language?: string;
  encoding?: string;
  wordCount?: number;
  readingTimeMinutes?: number;
  chapters?: StudyChapter[];
  analysisStatus?: "analyzed" | "fallback";
  analyzedAt?: string;
  width?: number;
  height?: number;
  hasTextLayer?: boolean;
  ocrPerformed?: boolean;
  ocrConfidence?: number;
  transcriptionPerformed?: boolean;
  transcriptionModel?: string;
  transcriptionConfidence?: number;
  processingTimeMs?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ExtractedContent = {
  id: string;
  studyId: string;
  fileId: string;
  fileType: ExtractionFileType;
  extractedText: string;
  sections?: DocumentSection[];
  transcription?: {
    segments: TranscriptionSegment[];
    chapters: MediaChapter[];
  };
  metadata: ExtractionMetadata;
  stages?: IngestionStage[];
  logs?: IngestionLog[];
  status: ExtractionStatus;
  createdAt: string;
  error?: string;
  errorDetails?: ExtractionErrorDetails;
};

export type ExtractionResult = Pick<
  ExtractedContent,
  "extractedText" | "metadata" | "sections" | "transcription"
>;

export type ExtractionStore = {
  version: 1;
  records: ExtractedContent[];
};

export type ExtractionInput = {
  id: string;
  file: File;
  studyId: string;
};

export type ExtractionProgress = {
  fileId: string;
  status: ExtractionStatus;
  progress: number;
  stage?: IngestionStageId;
  message?: string;
  errorDetails?: ExtractionErrorDetails;
};
