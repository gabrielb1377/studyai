export type ExamPriority = "high" | "medium" | "low";

export type ExamSubject = {
  id: string;
  name: string;
  priority: ExamPriority;
  completed: boolean;
};

export type Exam = {
  id: string;
  studyId?: string;
  title: string;
  discipline: string;
  examDate: string;
  subjects: ExamSubject[];
  materialIds: string[];
  dailyMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type ExamPlanItem = {
  dayIndex: number;
  dateStr: string;
  subjectName: string;
  priority: ExamPriority;
  estimatedMinutes: number;
  completed: boolean;
};
