import type { Exam } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";

export type ExamLearningAction = "tutor" | "flashcards" | "quiz" | "exam";

/**
 * Resolve o vínculo somente contra o catálogo de estudos já autorizado para
 * a sessão atual. O studyId persistido na prova nunca é usado como autorização.
 */
export function resolveExamStudy(exam: Pick<Exam, "studyId"> | undefined, studies: readonly StudyRecord[]) {
  if (!exam?.studyId) return undefined;
  return studies.find((study) => study.studyId === exam.studyId);
}

export function examLearningHref(studyId: string, action: ExamLearningAction) {
  const encodedStudyId = encodeURIComponent(studyId);
  const tab = action === "tutor" ? "ia" : action === "exam" ? "quiz" : action;
  const mode = action === "exam" ? "&modo=exam" : "";
  return `/estudo?tema=${encodedStudyId}&aba=${tab}${mode}`;
}
