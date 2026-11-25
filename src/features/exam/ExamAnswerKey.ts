import type { MaterialExamAttempt, MaterialExamQuestion } from "@/types/exam";

export function questionRevision(question: MaterialExamQuestion) {
  return JSON.stringify([question.materialId, question.page, question.statement, question.alternatives]);
}

export function confirmedChoice(attempt: MaterialExamAttempt, question: MaterialExamQuestion, current?: MaterialExamQuestion) {
  const key = attempt.confirmedKeys?.[question.id];
  if (!key || key.source !== "student-document" || !current || current.id !== question.id) return undefined;
  if (key.revision !== questionRevision(question) || key.revision !== questionRevision(current)) return undefined;
  return Number.isInteger(key.choice) && key.choice >= 0 && key.choice < question.alternatives.length ? key.choice : undefined;
}
