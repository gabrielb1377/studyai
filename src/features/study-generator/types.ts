import type { ExtractionMetadata } from "@/features/extraction/ExtractionTypes";
import type { StudyChapter } from "@/types/study-engine";

export type StudyAnalysisStatus = "analyzed" | "fallback";

export type StudyAnalysis = Pick<
  ExtractionMetadata,
  | "title"
  | "subject"
  | "topic"
  | "subtopics"
  | "keywords"
  | "summaryPreview"
  | "language"
  | "pageCount"
  | "wordCount"
  | "readingTimeMinutes"
  | "createdAt"
  | "updatedAt"
> & {
  title: string;
  subject: string;
  topic: string;
  subtopics: string[];
  chapters: StudyChapter[];
  keywords: string[];
  summaryPreview: string;
  wordCount: number;
  readingTimeMinutes: number;
  analysisStatus: StudyAnalysisStatus;
  analyzedAt: string;
};

export type TopicDetection = {
  title: string;
  topic: string;
  subtopics: string[];
  chapters: StudyChapter[];
};

