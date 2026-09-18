import type { TutorStudyContext } from "@/types/tutor-context";

export function isTutorStudyContext(value: unknown): value is TutorStudyContext {
  if (typeof value !== "object" || value === null) return false;
  const context = value as Partial<TutorStudyContext>;
  const validDocument = context.document === undefined || (
    typeof context.document === "object" && context.document !== null &&
    (context.document.title === undefined || typeof context.document.title === "string") &&
    (context.document.subject === undefined || typeof context.document.subject === "string") &&
    (context.document.topic === undefined || typeof context.document.topic === "string") &&
    (context.document.summaryPreview === undefined || typeof context.document.summaryPreview === "string") &&
    (context.document.language === undefined || typeof context.document.language === "string") &&
    Array.isArray(context.document.keywords) && context.document.keywords.every((keyword) => typeof keyword === "string")
  );
  const validLearning = context.learning === undefined || (
    typeof context.learning === "object" && context.learning !== null &&
    typeof context.learning.knowledge === "number" &&
    typeof context.learning.confidence === "number" &&
    (context.learning.mastery === "Iniciante" || context.learning.mastery === "Intermediário" || context.learning.mastery === "Avançado") &&
    (context.learning.classification === "difficult" || context.learning.classification === "forgotten" || context.learning.classification === "strong" || context.learning.classification === "never_studied" || context.learning.classification === "developing") &&
    (context.learning.priority === "Alta" || context.learning.priority === "Média" || context.learning.priority === "Baixa") &&
    Array.isArray(context.learning.reasons) && context.learning.reasons.every((reason) => typeof reason === "string")
  );

  return typeof context.studyId === "string" && typeof context.title === "string" &&
    typeof context.subject === "string" && typeof context.topic === "string" &&
    typeof context.progress === "number" &&
    (context.status === "not_started" || context.status === "in_progress" || context.status === "completed") &&
    Array.isArray(context.notes) && context.notes.every((note) =>
      typeof note === "object" && note !== null && typeof note.title === "string" && typeof note.content === "string",
    ) && (context.summary === undefined || (
      typeof context.summary === "object" && context.summary !== null &&
      typeof context.summary.title === "string" && typeof context.summary.content === "string"
    )) && validDocument && validLearning;
}
