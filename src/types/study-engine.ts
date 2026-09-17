export type StudyStatus = "not_started" | "in_progress" | "completed";

export type StudyChapterMarker =
  | "objectives"
  | "introduction"
  | "unit"
  | "chapter"
  | "section"
  | "activities"
  | "exercises"
  | "conclusion"
  | "references";

export type StudyChapter = {
  id: string;
  title: string;
  marker: StudyChapterMarker;
  order: number;
  page?: number;
  slide?: number;
};

export type StudyRecord = {
  studyId: string;
  title: string;
  subject: string;
  course?: string;
  semester?: string;
  materialIds: string[];
  status: StudyStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  initialSummary?: string;
  detectedTitle?: string;
  detectedSubject?: string;
  detectedTopic?: string;
  keywords?: string[];
  language?: string;
  subtopics?: string[];
  chapters?: StudyChapter[];
  pageCount?: number;
  wordCount?: number;
  readingTimeMinutes?: number;
  analysisStatus?: "analyzed" | "fallback";
  analyzedAt?: string;
};
