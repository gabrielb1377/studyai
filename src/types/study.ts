import type { MediaTranscriptionSource, TranscriptionSegment } from "@/features/extraction/ExtractionTypes";

export type StudyMaterialType = "pdf" | "video" | "audio" | "text" | "image" | "document";

export type StudyMaterial = {
  id: string;
  name: string;
  type: StudyMaterialType;
  mimeType: string;
  size: number;
  source?: string;
  textContent?: string;
  fileType?: string;
  duration?: number;
  transcriptionPerformed?: boolean;
  transcriptionSource?: MediaTranscriptionSource;
  transcriptionSegments?: TranscriptionSegment[];
  chapters?: Array<{
    id: string;
    title: string;
    page?: number;
    slide?: number;
  }>;
  persistentBinary?: boolean;
  binaryStorageId?: string;
  lastModified?: number;
};
