import type { PlanningActivityKind, PlanningPriority } from "../types";

export const KIND_LABELS: Record<PlanningActivityKind, string> = {
  exam_prep: "Semana de Prova",
  review: "Revisão",
  flashcards: "Flashcards",
  practice_quiz: "Prática / Quiz",
  lab: "Laboratório",
  tutor: "Tutor IA",
  study_reading: "Leitura guiada",
};

export const PRIORITY_LABELS: Record<PlanningPriority, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export const PRIORITY_BADGE_CLASSES: Record<PlanningPriority, string> = {
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-border bg-muted/60 text-muted-foreground",
};

export const KIND_BADGE_CLASSES: Record<PlanningActivityKind, string> = {
  exam_prep: "border-primary/30 bg-primary/10 text-primary",
  review: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  flashcards: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  practice_quiz: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  lab: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  tutor: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  study_reading: "border-border bg-muted/60 text-foreground",
};
