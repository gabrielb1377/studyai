import { expect, test } from "@playwright/test";
import { summarizeStudyProgress } from "../src/features/dashboard/StudyProgressSummary";
import { ExamService } from "../src/features/exam/ExamService";
import { scheduleTopicReview } from "../src/features/learning/TopicReview";
import { disciplineKey } from "../src/features/tutor/services/DisciplineContext";
import type { StudyRecord } from "../src/types/study-engine";

test("mantém disciplinas homônimas separadas e só usa datas e vínculos válidos", () => {
  const now = new Date(2026, 10, 12, 12);
  const a: StudyRecord = {
    studyId: "a", title: "Vetores", subject: "Matemática", course: "Computação", semester: "1",
    materialIds: [], status: "in_progress", progress: 37,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), lastAccessedAt: now.toISOString(),
  };
  const b = { ...a, studyId: "b", course: "Física", progress: 82 };
  const review = scheduleTopicReview({ studyId: a.studyId, topic: a.title, discipline: disciplineKey(a) }, undefined, "reviewed", "normal", now);
  const exam = ExamService.create({
    title: "Prova", discipline: a.subject, examDate: "2026-11-12", dailyMinutes: 30, subjects: [], materialIds: [],
  });
  const summary = summarizeStudyProgress([a, b], [], [
    { ...review, nextReviewAt: new Date(2026, 10, 11, 12).toISOString() },
    { ...review, studyId: b.studyId },
    { ...review, nextReviewAt: "data inválida" },
  ], [exam, { ...exam, examDate: "2026-11-11" }, { ...exam, examDate: "2026-02-30" }], [], now);
  expect(summary.disciplines.map(({ studies }) => studies.map(({ progress }) => progress))).toEqual([[37], [82]]);
  expect(summary.pending.map(({ study, period }) => [study.studyId, period])).toEqual([["a", "late"]]);
  expect(summary.upcoming.map(({ days }) => days)).toEqual([0]);
  expect(summary.simulations).toEqual([]);
});
