export const extractionFileTypes = [
  "pdf",
  "docx",
  "pptx",
  "txt",
  "mp3",
  "mp4",
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

export type ExtractionStore = {
  version: 1;
  records: ExtractedContent[];
};

export type ExtractionInput = {
  id: string;
  file: File;
};

export type ExtractionProgress = {
  fileId: string;
  status: ExtractionStatus;
  progress: number;
};
