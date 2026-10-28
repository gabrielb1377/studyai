import type { Exam, ExamPlanItem } from "@/types/exam";

const STORAGE_KEY = "studyai:exams";
const UPDATE_EVENT = "studyai:exams-updated";

function isExamList(value: unknown): value is Exam[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === "object" && item !== null &&
    typeof item.id === "string" && typeof item.title === "string" &&
    typeof item.discipline === "string" && typeof item.examDate === "string" &&
    Array.isArray(item.subjects) && Array.isArray(item.materialIds) &&
    typeof item.dailyMinutes === "number",
  );
}

export const ExamService = {
  load(): Exam[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return isExamList(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  save(exams: readonly Exam[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  },

  create(data: Omit<Exam, "id" | "createdAt" | "updatedAt">, now = new Date().toISOString()): Exam {
    return {
      ...data,
      id: `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
  },

  generatePlan(exam: Exam): ExamPlanItem[] {
    const now = new Date();
    const examDate = new Date(exam.examDate);
    const diffDays = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = Math.max(1, diffDays);

    const uncompleted = exam.subjects.filter((s) => !s.completed);
    if (uncompleted.length === 0) {
      return exam.subjects.map((s, idx) => ({
        dayIndex: idx + 1,
        dateStr: new Date(now.getTime() + idx * 86400000).toLocaleDateString("pt-BR"),
        subjectName: s.name,
        priority: s.priority,
        estimatedMinutes: exam.dailyMinutes,
        completed: s.completed,
      }));
    }

    // Sort uncompleted by priority (high first, then medium, then low)
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    const sorted = [...uncompleted].sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

    const plan: ExamPlanItem[] = [];
    for (let day = 0; day < totalDays; day++) {
      const subject = sorted[day % sorted.length];
      if (!subject) continue;
      const date = new Date(now.getTime() + day * 86400000);
      plan.push({
        dayIndex: day + 1,
        dateStr: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        subjectName: subject.name,
        priority: subject.priority,
        estimatedMinutes: exam.dailyMinutes,
        completed: false,
      });
    }
    return plan;
  },
};
