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

export type ExtractionMetadata = {
  name: string;
  type: string;
  size: number;
  pageCount?: number;
  duration?: number;
  language?: string;
  width?: number;
  height?: number;
  ocrPerformed?: boolean;
  ocrConfidence?: number;
  transcriptionPerformed?: boolean;
  transcriptionModel?: string;
  processingTimeMs?: number;
};

export type ExtractedContent = {
  id: string;
  studyId: string;
  fileId: string;
  fileType: ExtractionFileType;
  extractedText: string;
  metadata: ExtractionMetadata;
  status: ExtractionStatus;
  createdAt: string;
  error?: string;
};

export type ExtractionResult = Pick<ExtractedContent, "extractedText" | "metadata">;

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
};
