export type StudyStatus = "not_started" | "in_progress" | "completed";

export type StudyRecord = {
  studyId: string;
  title: string;
  subject: string;
  status: StudyStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
};
