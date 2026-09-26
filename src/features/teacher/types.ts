export const teacherLevels = ["beginner", "intermediate", "advanced", "technical", "brief"] as const;

export type TeacherLevel = (typeof teacherLevels)[number];

export const teacherMethods = [
  "traditional",
  "step_by_step",
  "analogies",
  "practical_examples",
  "questions_and_answers",
  "socratic",
  "quick_review",
] as const;

export type TeacherMethod = (typeof teacherMethods)[number];

export const teacherActions = [
  "dialogue",
  "guided_lesson",
  "lesson_plan",
  "flowchart",
  "mind_map",
  "timeline",
  "exercise",
  "compare",
  "adaptive_summary",
  "explain_selection",
] as const;

export type TeacherAction = (typeof teacherActions)[number];

export const teacherSummaryStyles = ["short", "medium", "complete", "topics", "checklist", "review_guide"] as const;

export type TeacherSummaryStyle = (typeof teacherSummaryStyles)[number];

export type TeacherMaterialSelection = {
  text: string;
  sourceName?: string;
  page?: number;
  chapter?: string;
};

export type TeacherPreferences = {
  level: TeacherLevel;
  method: TeacherMethod;
  summaryStyle: TeacherSummaryStyle;
};

export type TeacherRequest = TeacherPreferences & {
  mode: "teacher";
  action: TeacherAction;
  selection?: TeacherMaterialSelection;
};

export const teacherLevelLabels: Record<TeacherLevel, string> = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  advanced: "Avançado",
  technical: "Técnico",
  brief: "Resumido",
};

export const teacherMethodLabels: Record<TeacherMethod, string> = {
  traditional: "Aula tradicional",
  step_by_step: "Passo a passo",
  analogies: "Analogias",
  practical_examples: "Exemplos práticos",
  questions_and_answers: "Perguntas e respostas",
  socratic: "Método socrático",
  quick_review: "Revisão rápida",
};

export const teacherSummaryStyleLabels: Record<TeacherSummaryStyle, string> = {
  short: "Resumo curto",
  medium: "Resumo médio",
  complete: "Resumo completo",
  topics: "Tópicos",
  checklist: "Checklist",
  review_guide: "Guia de revisão",
};

export const defaultTeacherPreferences: TeacherPreferences = {
  level: "intermediate",
  method: "step_by_step",
  summaryStyle: "medium",
};

export function isBroadTeacherAction(action: TeacherAction) {
  return action === "guided_lesson" || action === "lesson_plan" || action === "mind_map" ||
    action === "timeline" || action === "adaptive_summary";
}
