import type {
  PlanningActivityKind,
  PlanningFocus,
  PlanningPriority,
  StudyPlan,
  StudyPlanConfig,
  StudyPlanItem,
} from "./types";

export const MIN_DAILY_MINUTES = 15;
export const MAX_DAILY_MINUTES = 360;
export const MIN_HORIZON_DAYS = 1;
export const MAX_HORIZON_DAYS = 30;
export const MIN_ITEM_MINUTES = 10;
export const MAX_ITEM_MINUTES = 180;
export const MAX_PLAN_ITEMS = 90;

const VALID_KINDS: readonly PlanningActivityKind[] = [
  "exam_prep",
  "review",
  "flashcards",
  "practice_quiz",
  "lab",
  "tutor",
  "study_reading",
];

export function isPlanningPriority(value: unknown): value is PlanningPriority {
  return value === "high" || value === "medium" || value === "low";
}

export function isPlanningFocus(value: unknown): value is PlanningFocus {
  return value === "balanced" || value === "exams" || value === "reviews";
}

export function isPlanningActivityKind(value: unknown): value is PlanningActivityKind {
  return typeof value === "string" && (VALID_KINDS as readonly string[]).includes(value);
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function clampDailyMinutes(value: unknown, fallback = 60): number {
  return clampNumber(value, MIN_DAILY_MINUTES, MAX_DAILY_MINUTES, fallback);
}

export function clampHorizonDays(value: unknown, fallback = 7): number {
  return clampNumber(value, MIN_HORIZON_DAYS, MAX_HORIZON_DAYS, fallback);
}

export function clampItemMinutes(value: unknown, fallback = 25): number {
  return clampNumber(value, MIN_ITEM_MINUTES, MAX_ITEM_MINUTES, fallback);
}

export function sanitizeText(value: unknown, maxLength: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalDays(baseDate: Date, offset: number): string {
  const target = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset);
  return formatLocalDate(target);
}

export function formatDateLabel(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export function createDefaultPlanConfig(): StudyPlanConfig {
  return {
    title: "Plano de Estudos",
    goal: "",
    dailyMinutes: 60,
    horizonDays: 7,
    includeExams: true,
    preferredFocus: "balanced",
    selectedStudyIds: [],
    manualStudyPriorities: {},
  };
}

function sanitizeItem(raw: unknown, horizonDays: number): StudyPlanItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Partial<StudyPlanItem>;
  if (typeof item.id !== "string" || !item.id.trim()) return null;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (!isPlanningActivityKind(item.kind)) return null;

  const priority = isPlanningPriority(item.priority) ? item.priority : "medium";
  const dayOffset = clampNumber(item.dayOffset, 0, horizonDays - 1, 0);
  const dateStr =
    typeof item.dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.dateStr)
      ? item.dateStr
      : addLocalDays(new Date(), dayOffset);

  return {
    id: item.id.slice(0, 180),
    dayOffset,
    dateStr,
    studyId: typeof item.studyId === "string" && item.studyId.trim() ? item.studyId.slice(0, 120) : undefined,
    studyTitle: sanitizeText(item.studyTitle, 140, "Estudo"),
    subject: sanitizeText(item.subject, 80, "Geral"),
    kind: item.kind,
    title: sanitizeText(item.title, 160, "Atividade de estudo"),
    reason: sanitizeText(item.reason, 220, "Recomendado pelo histórico recente"),
    priority,
    priorityScore: clampNumber(item.priorityScore, 0, 100, 50),
    estimatedMinutes: clampItemMinutes(item.estimatedMinutes, 25),
    completed: Boolean(item.completed),
    completedAt: typeof item.completedAt === "string" ? item.completedAt : undefined,
    examId: typeof item.examId === "string" && item.examId.trim() ? item.examId.slice(0, 120) : undefined,
    examTitle: typeof item.examTitle === "string" ? sanitizeText(item.examTitle, 140) || undefined : undefined,
    targetHref:
      typeof item.targetHref === "string" && item.targetHref.startsWith("/")
        ? item.targetHref.slice(0, 320)
        : "/estudo",
    sourceUnavailable: Boolean(item.sourceUnavailable) || undefined,
  };
}

export function sanitizeStudyPlan(raw: unknown): StudyPlan | null {
  if (typeof raw !== "object" || raw === null) return null;
  const plan = raw as Partial<StudyPlan>;
  if (plan.version !== 1 || typeof plan.id !== "string" || !plan.id.trim()) return null;

  const dailyMinutes = clampDailyMinutes(plan.dailyMinutes, 60);
  const horizonDays = clampHorizonDays(plan.horizonDays, 7);

  const manualStudyPriorities: Record<string, PlanningPriority> = {};
  if (plan.manualStudyPriorities && typeof plan.manualStudyPriorities === "object") {
    for (const [studyId, priority] of Object.entries(plan.manualStudyPriorities)) {
      if (studyId.trim() && isPlanningPriority(priority)) {
        manualStudyPriorities[studyId.slice(0, 120)] = priority;
      }
    }
  }

  const selectedStudyIds = Array.isArray(plan.selectedStudyIds)
    ? Array.from(
        new Set(
          plan.selectedStudyIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
        ),
      ).slice(0, 60)
    : [];

  const seenIds = new Set<string>();
  const items: StudyPlanItem[] = [];
  if (Array.isArray(plan.items)) {
    for (const rawItem of plan.items) {
      if (items.length >= MAX_PLAN_ITEMS) break;
      const clean = sanitizeItem(rawItem, horizonDays);
      if (!clean || seenIds.has(clean.id)) continue;
      seenIds.add(clean.id);
      items.push(clean);
    }
  }

  const nowIso = new Date().toISOString();
  return {
    version: 1,
    id: plan.id.slice(0, 120),
    title: sanitizeText(plan.title, 100, "Plano de Estudos") || "Plano de Estudos",
    goal: sanitizeText(plan.goal, 240, ""),
    dailyMinutes,
    horizonDays,
    includeExams: plan.includeExams !== false,
    preferredFocus: isPlanningFocus(plan.preferredFocus) ? plan.preferredFocus : "balanced",
    selectedStudyIds,
    manualStudyPriorities,
    items,
    createdAt: typeof plan.createdAt === "string" ? plan.createdAt : nowIso,
    updatedAt: typeof plan.updatedAt === "string" ? plan.updatedAt : nowIso,
  };
}
