import type { DifficultyLevelState } from "../DifficultyMapEngine";
import type { ErrorReviewStatus, ErrorSource } from "../types";

export const LEVEL_LABELS: Record<DifficultyLevelState, string> = {
  critical: "Dificuldade alta",
  attention: "Requer atenção",
  insufficient_data: "Sem dados suficientes",
  mastered: "Domínio satisfatório",
};

export const LEVEL_BADGE_CLASSES: Record<DifficultyLevelState, string> = {
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  attention: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  insufficient_data: "border-border bg-muted/60 text-muted-foreground",
  mastered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export const SOURCE_LABELS: Record<ErrorSource, string> = {
  quiz: "Quiz",
  flashcard: "Flashcard",
  exam_material: "Simulado de material",
  manual: "Registro manual",
};

export const ERROR_STATUS_LABELS: Record<ErrorReviewStatus, string> = {
  pending: "Pendente",
  reviewed: "Revisado",
  resolved: "Resolvido",
};

export const ERROR_STATUS_CLASSES: Record<ErrorReviewStatus, string> = {
  pending: "border-destructive/30 bg-destructive/10 text-destructive",
  reviewed: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export const REVIEW_STATUS_LABELS = {
  late: "Revisão atrasada",
  today: "Revisar hoje",
  upcoming: "Em dia",
  new: "Sem revisão",
} as const;
