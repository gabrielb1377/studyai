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
  "semantic",
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
  tableId?: string;
};

export const ocrModes = ["auto", "native", "force"] as const;
export type OcrMode = (typeof ocrModes)[number];

export type PageMethod = "native" | "ocr" | "none";
export type PageStatus = "ready" | "review" | "error";
export type QualityLevel = "good" | "fair" | "poor" | "unknown";

export type PageQuality = {
  level: QualityLevel;
  issues: string[];
};

export type ExtractedTable = {
  id: string;
  page: number;
  markdown: string;
  header: boolean;
  complete: boolean;
  source: "text" | "ocr";
  warnings: string[];
  rows: string[][];
  columns: number;
};

export type ExtractedPage = {
  page: number;
  method: PageMethod;
  status: PageStatus;
  text: string;
  originalText: string;
  edited: boolean;
  editedAt?: string;
  needsOcr: boolean;
  confidence?: number;
  quality: PageQuality;
  tables: ExtractedTable[];
  warnings: string[];
  width?: number;
  height?: number;
  rotation?: number;
  durationMs?: number;
};

export type OcrPipelineInfo = {
  version: string;
  mode: OcrMode;
  engine: "tesseract.js" | "pdfjs" | "none";
  pages: number;
  nativePages: number;
  ocrPages: number;
  failedPages: number;
  reviewedPages: number;
  cancelled: boolean;
  durationMs?: number;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
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
  institution?: string;
  professor?: string;
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
  extractionMode?: OcrMode;
  pipelineVersion?: string;
  ocrPages?: number;
  nativePages?: number;
  failedPages?: number;
  reviewedPages?: number;
  hasScannedPages?: boolean;
  quality?: QualityLevel;
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
  pages?: ExtractedPage[];
  pipeline?: OcrPipelineInfo;
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
  "extractedText" | "metadata" | "sections" | "transcription" | "pages" | "pipeline"
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
  page?: number;
  pages?: number;
  cancelled?: boolean;
  errorDetails?: ExtractionErrorDetails;
};
