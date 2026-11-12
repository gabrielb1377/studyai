import { confirmedChoice } from "@/features/exam/ExamAnswerKey";
import { examQuestionCatalog } from "@/features/exam/ExamQuestionCatalog";
import { daysUntilExam } from "@/features/exam/ExamService";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { reviewPeriod, type TopicReview } from "@/features/learning/TopicReview";
import { disciplineKey } from "@/features/tutor/services/DisciplineContext";
import type { Exam } from "@/types/exam";
import type { Material } from "@/types/material";
import type { StudyRecord } from "@/types/study-engine";

export function summarizeStudyProgress(
  studies: StudyRecord[], materials: Material[], reviews: TopicReview[], exams: Exam[], contents: ExtractedContent[], now: Date,
) {
  const groups = new Map<string, { key: string; title: string; detail: string; studies: StudyRecord[] }>();
  for (const material of [...materials, ...studies]) {
    const key = disciplineKey(material);
    if (!key || groups.has(key)) continue;
    groups.set(key, {
      key, title: material.subject!.trim(),
      detail: [material.course?.trim(), material.semester?.trim()].filter(Boolean).join(" · "), studies: [],
    });
  }
  for (const study of studies) {
    const key = disciplineKey(study);
    groups.get(key)?.studies.push(study);
  }
  const pending = reviews.flatMap((review) => {
    if (!Number.isFinite(Date.parse(review.nextReviewAt))) return [];
    const group = groups.get(review.discipline);
    const study = group?.studies.find(({ studyId }) => studyId === review.studyId);
    if (!group || !study) return [];
    return [{ review, group, study, period: reviewPeriod(review.nextReviewAt, now) }];
  }).sort((a, b) => Date.parse(a.review.nextReviewAt) - Date.parse(b.review.nextReviewAt));

  const upcoming = exams.flatMap((exam) => {
    const days = daysUntilExam(exam.examDate, now);
    return days !== null && days >= 0 ? [{ exam, days }] : [];
  }).sort((a, b) => a.days - b.days || (a.exam.examTime ?? "99").localeCompare(b.exam.examTime ?? "99"));

  const simulations = exams.flatMap((exam) => {
    if (!exam.disciplineKey) return [];
    const attempts = [...new Map((exam.materialAttempts ?? [])
      .filter((attempt) => attempt.examId === exam.id && attempt.disciplineKey === exam.disciplineKey && attempt.completedAt)
      .map((attempt) => [attempt.id, attempt])).values()];
    if (!attempts.length) return [];
    const selected = new Set(exam.materialIds);
    const catalog = new Map(examQuestionCatalog(materials.filter(({ id }) => selected.has(id)), contents, exam.disciplineKey)
      .map((question) => [question.id, question]));
    let correct = 0, wrong = 0, declaredCorrect = 0, declaredWrong = 0;
    for (const attempt of attempts) {
      for (const question of attempt.questions) {
        const answer = attempt.answers[question.id];
        if (!answer || !Number.isInteger(answer.choice) || answer.choice < 0 || answer.choice >= question.alternatives.length) continue;
        const key = confirmedChoice(attempt, question, catalog.get(question.id));
        if (key !== undefined) {
          if (key === answer.choice) correct++;
          else wrong++;
        } else if (answer.assessment === "correct") declaredCorrect++;
        else if (answer.assessment === "wrong") declaredWrong++;
      }
    }
    return [{ exam, count: attempts.length, correct, wrong, declaredCorrect, declaredWrong }];
  });
  return { disciplines: [...groups.values()], pending, upcoming, simulations };
}
