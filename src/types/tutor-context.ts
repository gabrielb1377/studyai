import type { StudyStatus } from "@/types/study-engine";

export type TutorStudyContext = {
  studyId: string;
  title: string;
  subject: string;
  topic: string;
  status: StudyStatus;
  progress: number;
  learning?: {
    knowledge: number;
    confidence: number;
    mastery: "Iniciante" | "Intermediário" | "Avançado";
    classification: "difficult" | "forgotten" | "strong" | "never_studied" | "developing";
    priority: "Alta" | "Média" | "Baixa";
    reasons: string[];
  };
  summary?: {
    title: string;
    content: string;
  };
  notes: Array<{
    title: string;
    content: string;
  }>;
  document?: {
    title?: string;
    subject?: string;
    topic?: string;
    summaryPreview?: string;
    keywords: string[];
    language?: string;
    subtopics: string[];
    chapterCount: number;
    chapters: Array<{
      title: string;
      marker: string;
      page?: number;
      slide?: number;
    }>;
  };
  knowledge?: {
    matchedConcepts: Array<{
      name: string;
      description: string;
      aliases: string[];
      relatedConcepts: string[];
    }>;
    relationshipCount: number;
  };
  mentor?: {
    lastSessionStatus?: "active" | "paused" | "completed";
    lastSessionAt?: string;
    recommendations: Array<{
      title: string;
      reason: string;
      priority: "Alta" | "Média" | "Baixa";
    }>;
  };
};
