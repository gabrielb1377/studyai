import type { Exam, ExamPlanItem } from "@/types/exam";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";

const STORAGE_KEY_PREFIX = "studyai:exams:";
const UPDATE_EVENT = "studyai:exams-updated";
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseExamDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  return date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day ? date : null;
}

export function daysUntilExam(value: string, now = new Date()): number | null {
  const examDate = parseExamDate(value);
  if (!examDate) return null;
  const examDay = Date.UTC(examDate.getFullYear(), examDate.getMonth(), examDate.getDate());
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((examDay - currentDay) / DAY_MS);
}

export function formatExamDate(value: string): string {
  return parseExamDate(value)?.toLocaleDateString("pt-BR") ?? "Data inválida";
}

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function currentUserId(): string | null {
  if (typeof window === "undefined") return null;
  const session = SessionOperationManager.current();
  return session.suspended ? null : session.userId ?? null;
}

function isExamList(value: unknown): value is Exam[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === "object" && item !== null &&
    typeof item.id === "string" && typeof item.title === "string" &&
    typeof item.discipline === "string" && typeof item.examDate === "string" &&
    Array.isArray(item.subjects) && Array.isArray(item.materialIds) &&
    item.materialIds.every((id: unknown) => typeof id === "string") &&
    typeof item.dailyMinutes === "number",
  );
}

function normalizeExam(exam: Exam): Exam {
  return { ...exam, materialIds: Array.from(new Set(exam.materialIds)) };
}

export type ExamMaterialCatalog = {
  readonly materialIds: readonly string[];
  readonly isComplete: boolean;
  readonly userId: string;
  readonly generation: number;
};

export const ExamService = {
  load(): Exam[] {
    if (typeof window === "undefined") return [];
    const userId = currentUserId();
    if (!userId) return [];
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return isExamList(parsed) ? parsed.map(normalizeExam) : [];
    } catch {
      return [];
    }
  },

  /**
   * Remove referências órfãs somente quando o catálogo foi carregado por
   * completo e ainda pertence à mesma geração de sessão.
   */
  pruneOrphanMaterials(catalog: ExamMaterialCatalog): Exam[] | null {
    if (typeof window === "undefined" || !catalog.isComplete) return null;
    const session = SessionOperationManager.current();
    if (
      session.suspended ||
      !session.userId ||
      session.userId !== catalog.userId ||
      session.generation !== catalog.generation
    ) return null;

    const valid = new Set(catalog.materialIds);
    try {
      const raw = localStorage.getItem(storageKey(session.userId));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isExamList(parsed)) return null;
      const cleaned = parsed.map((exam) => {
        const materialIds = Array.from(new Set(exam.materialIds.filter((id) => valid.has(id))));
        const changed = materialIds.length !== exam.materialIds.length ||
          materialIds.some((id, index) => id !== exam.materialIds[index]);
        return changed ? { ...exam, materialIds, updatedAt: new Date().toISOString() } : exam;
      });
      const changed = cleaned.some((exam, index) => exam !== parsed[index]);
      if (!changed) return null;
      localStorage.setItem(storageKey(session.userId), JSON.stringify(cleaned));
      window.dispatchEvent(new Event(UPDATE_EVENT));
      return cleaned;
    } catch {
      // Falhas de leitura nunca autorizam remover vínculos existentes.
      return null;
    }
  },

  save(exams: readonly Exam[]) {
    if (typeof window === "undefined") return;
    const userId = currentUserId();
    if (!userId) return;
    const serialized = JSON.stringify(exams.map(normalizeExam));
    if (localStorage.getItem(storageKey(userId)) === serialized) return;
    localStorage.setItem(storageKey(userId), serialized);
    window.dispatchEvent(new Event(UPDATE_EVENT));
  },

  create(data: Omit<Exam, "id" | "createdAt" | "updatedAt">, now = new Date().toISOString()): Exam {
    return {
      ...data,
      materialIds: Array.from(new Set(data.materialIds)),
      id: `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
  },

  generatePlan(exam: Exam, now = new Date()): ExamPlanItem[] {
    const diffDays = daysUntilExam(exam.examDate, now);
    const totalDays = Math.max(1, diffDays ?? 1);

    const uncompleted = exam.subjects.filter((subject) => !subject.completed);
    if (uncompleted.length === 0) {
      return exam.subjects.map((subject, index) => ({
        dayIndex: index + 1,
        dateStr: new Date(now.getTime() + index * 86400000).toLocaleDateString("pt-BR"),
        subjectName: subject.name,
        priority: subject.priority,
        estimatedMinutes: exam.dailyMinutes,
        completed: subject.completed,
      }));
    }

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
