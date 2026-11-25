import type { Material } from "@/types/material";
import type { MaterialExamQuestion } from "@/types/exam";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { contentNeedsTutorReview, detectExercises, pageNeedsTutorReview } from "@/features/ocr/exercise-review";
import { disciplineKey } from "@/features/tutor/services/DisciplineContext";

function extractPageQuestions(text: string, page: number) {
  const questions = detectExercises(text, page);
  const markers = [...text.matchAll(/^\s*(?:gabarito|resposta\s+correta)\s*:\s*([A-E])\s*$/gimu)];
  const label = markers.length === 1 && questions.length === 1 ? markers[0][1].toUpperCase() : undefined;
  return questions.map((question) => ({
    ...question, suggestedChoice: label ? question.alternatives.findIndex((item) => item.label === label) : -1,
  }));
}

export function examQuestionCatalog(materials: readonly Material[], records: readonly ExtractedContent[], key: string): MaterialExamQuestion[] {
  const byFile = new Map(records.map((record) => [record.fileId, record]));
  return materials.flatMap((material) => {
    const record = byFile.get(material.id);
    if (!record || record.status !== "extracted" || disciplineKey(material) !== key) return [];
    const exercises = record.pages?.length
      ? record.pages.filter((page) => !pageNeedsTutorReview(page)).flatMap((page) => extractPageQuestions(page.text, page.page))
      : !contentNeedsTutorReview(record) ? extractPageQuestions(record.extractedText, 0) : [];
    return exercises.map((question) => ({
      id: JSON.stringify([material.id, question.page, question.firstLine]),
      materialId: material.id,
      materialName: material.name,
      studyId: material.studyId,
      page: question.page || undefined,
      statement: question.statement,
      alternatives: question.alternatives.map(({ text }) => text),
      suggestedChoice: question.suggestedChoice >= 0 ? question.suggestedChoice : undefined,
    }));
  });
}
