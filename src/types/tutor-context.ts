import type { StudyStatus } from "@/types/study-engine";

export type TutorStudyContext = {
  studyId: string;
  title: string;
  subject: string;
  topic: string;
  status: StudyStatus;
  progress: number;
  summary?: {
    title: string;
    content: string;
  };
  notes: Array<{
    title: string;
    content: string;
  }>;
};
