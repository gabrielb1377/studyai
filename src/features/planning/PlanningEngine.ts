import { daysUntilExam } from "@/features/exam/ExamService";
import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";
import { ReviewScheduler } from "@/features/learning/ReviewScheduler";
import { StudyPriorityEngine } from "@/features/learning/StudyPriorityEngine";
import { reviewPeriod, type TopicReview } from "@/features/learning/TopicReview";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";
import type { LearningProfile } from "@/features/learning/types";
import type { Exam } from "@/types/exam";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import {
  MAX_PLAN_ITEMS,
  addLocalDays,
  clampDailyMinutes,
  clampHorizonDays,
  clampItemMinutes,
  clampNumber,
  sanitizeText,
} from "./PlanningValidation";
import type {
  PlanningPriority,
  StudyPlan,
  StudyPlanConfig,
  StudyPlanItem,
} from "./types";

export type PlanningSignalInput = {
  studies: readonly StudyRecord[];
  profile: LearningProfile;
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
  topicReviews: readonly TopicReview[];
  exams: readonly Exam[];
  errorEntries?: readonly ErrorNotebookEntry[];
  now?: Date;
};

type CandidateTask = Omit<StudyPlanItem, "dayOffset" | "dateStr"> & {
  preferredMaxDay?: number;
};

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function mapScoreToPriority(score: number): PlanningPriority {
  if (score >= 70) return "high";
  if (score >= 42) return "medium";
  return "low";
}

function manualPriorityBoost(priority: PlanningPriority | undefined): number {
  if (priority === "high") return 24;
  if (priority === "low") return -22;
  return 0;
}

function matchExamToStudy(exam: Exam, studies: readonly StudyRecord[]): StudyRecord | undefined {
  if (exam.studyId) {
    const direct = studies.find((study) => study.studyId === exam.studyId);
    if (direct) return direct;
  }
  if (exam.materialIds.length > 0) {
    const examMaterials = new Set(exam.materialIds);
    const byMaterial = studies.find((study) => study.materialIds.some((id) => examMaterials.has(id)));
    if (byMaterial) return byMaterial;
  }
  const examDiscipline = normalizeText(exam.discipline);
  if (!examDiscipline) return undefined;
  return studies.find(
    (study) =>
      normalizeText(study.subject) === examDiscipline ||
      normalizeText(study.title) === examDiscipline,
  );
}

function buildTargetHref(studyId: string, tab: "leitura" | "quiz" | "flashcards" | "tutor"): string {
  return `/estudo?tema=${encodeURIComponent(studyId)}&aba=${tab}&origem=planejamento`;
}

function buildExamReason(exam: Exam, daysLeft: number): string {
  const when = daysLeft <= 0 ? "Prova hoje" : daysLeft === 1 ? "Prova amanhã" : `Prova em ${daysLeft} dias`;
  const pendingSubjects = exam.subjects.filter((subject) => !subject.completed);
  if (pendingSubjects.length === 0) return `${when} · Revisão final recomendada`;
  const preview = pendingSubjects
    .slice(0, 2)
    .map((subject) => subject.name)
    .join(", ");
  return `${when} · ${pendingSubjects.length} tópico(s) pendente(s): ${preview}`;
}

function createCandidates(
  config: StudyPlanConfig,
  signals: PlanningSignalInput,
  now: Date,
): CandidateTask[] {
  const selectedSet = new Set(config.selectedStudyIds);
  const eligibleStudies =
    selectedSet.size > 0
      ? signals.studies.filter((study) => selectedSet.has(study.studyId))
      : [...signals.studies];

  const upcomingExams = config.includeExams
    ? signals.exams
        .map((exam) => ({ exam, daysLeft: daysUntilExam(exam.examDate, now) }))
        .filter((entry): entry is { exam: Exam; daysLeft: number } => entry.daysLeft !== null && entry.daysLeft >= 0)
        .sort((left, right) => left.daysLeft - right.daysLeft)
    : [];

  const linkedExamIds = new Set<string>();
  const candidates: CandidateTask[] = [];
  const seenIds = new Set<string>();

  const pushCandidate = (task: CandidateTask) => {
    if (seenIds.has(task.id)) return;
    seenIds.add(task.id);
    candidates.push(task);
  };

  for (const study of eligibleStudies) {
    const knowledge = KnowledgeEngine.calculate(
      study,
      signals.profile,
      signals.flashcards,
      signals.quizzes,
      now,
    );
    const calculatedPriority = StudyPriorityEngine.calculate(
      study,
      knowledge,
      signals.profile,
      signals.flashcards,
      now,
    );
    const studyPendingErrors = (signals.errorEntries ?? []).filter(
      (entry) => entry.studyId === study.studyId && entry.status === "pending",
    );
    const manualPriority = config.manualStudyPriorities[study.studyId];
    const baseScore =
      calculatedPriority.score +
      manualPriorityBoost(manualPriority) +
      Math.min(18, studyPendingErrors.length * 6);

    const studyExams = upcomingExams.filter(
      ({ exam }) => matchExamToStudy(exam, [study])?.studyId === study.studyId,
    );

    const nearestExam = studyExams[0];
    if (nearestExam) {
      linkedExamIds.add(nearestExam.exam.id);
      const urgencyBonus =
        nearestExam.daysLeft <= 2 ? 36 : nearestExam.daysLeft <= 6 ? 26 : nearestExam.daysLeft <= 14 ? 16 : 8;
      const focusBonus = config.preferredFocus === "exams" ? 18 : 0;
      const score = clampNumber(baseScore + urgencyBonus + focusBonus, 10, 100, 75);
      const pendingCount = nearestExam.exam.subjects.filter((subject) => !subject.completed).length;

      pushCandidate({
        id: `${study.studyId}:exam_prep:${nearestExam.exam.id}`,
        studyId: study.studyId,
        studyTitle: study.title,
        subject: study.subject,
        kind: "exam_prep",
        title: `Preparar ${study.title} para ${nearestExam.exam.title}`,
        reason: buildExamReason(nearestExam.exam, nearestExam.daysLeft),
        priority: manualPriority ?? mapScoreToPriority(score),
        priorityScore: score,
        estimatedMinutes: clampItemMinutes(Math.min(45, Math.max(25, pendingCount * 15)), 30),
        completed: false,
        examId: nearestExam.exam.id,
        examTitle: nearestExam.exam.title,
        targetHref: `/provas?prova=${encodeURIComponent(nearestExam.exam.id)}`,
        preferredMaxDay: Math.max(0, nearestExam.daysLeft),
      });
    }

    const dueReviews = signals.topicReviews.filter((review) => {
      if (review.studyId !== study.studyId) return false;
      const period = reviewPeriod(review.nextReviewAt, now);
      return period === "late" || period === "today" || review.wrong > review.correct;
    });

    if (dueReviews.length > 0) {
      const hasLate = dueReviews.some((review) => reviewPeriod(review.nextReviewAt, now) === "late");
      const reviewBonus = (hasLate ? 26 : 16) + (config.preferredFocus === "reviews" ? 18 : 0);
      const score = clampNumber(baseScore + reviewBonus, 10, 100, 70);
      pushCandidate({
        id: `${study.studyId}:review:general`,
        studyId: study.studyId,
        studyTitle: study.title,
        subject: study.subject,
        kind: "review",
        title: `Revisão espaçada · ${study.title}`,
        reason: hasLate
          ? `${dueReviews.length} tópico(s) com revisão atrasada`
          : `${dueReviews.length} tópico(s) programado(s) para revisão`,
        priority: manualPriority ?? mapScoreToPriority(score),
        priorityScore: score,
        estimatedMinutes: 25,
        completed: false,
        targetHref: buildTargetHref(study.studyId, "quiz"),
        preferredMaxDay: hasLate ? 0 : 2,
      });
    }

    if (studyPendingErrors.length > 0) {
      const errorBonus =
        20 +
        Math.min(16, studyPendingErrors.length * 4) +
        (config.preferredFocus === "reviews" ? 18 : 0);
      const score = clampNumber(baseScore + errorBonus, 10, 100, 74);
      pushCandidate({
        id: `${study.studyId}:review:error_notebook`,
        studyId: study.studyId,
        studyTitle: study.title,
        subject: study.subject,
        kind: "review",
        title: `Revisar erros registrados · ${study.title}`,
        reason: `${studyPendingErrors.length} erro(s) pendente(s) no Caderno de Erros`,
        priority: manualPriority ?? mapScoreToPriority(score),
        priorityScore: score,
        estimatedMinutes: clampItemMinutes(15 + studyPendingErrors.length * 5, 25),
        completed: false,
        targetHref: `/aprendizagem?estudo=${encodeURIComponent(study.studyId)}&aba=revisoes`,
        preferredMaxDay: 1,
      });
    }

    const dueFlashcards = signals.flashcards.filter(
      (card) => card.studyId === study.studyId && ReviewScheduler.isDue(card, now),
    );
    if (dueFlashcards.length > 0) {
      const flashBonus = 14 + Math.min(18, dueFlashcards.length * 2) + (config.preferredFocus === "reviews" ? 16 : 0);
      const score = clampNumber(baseScore + flashBonus, 10, 100, 62);
      pushCandidate({
        id: `${study.studyId}:flashcards:general`,
        studyId: study.studyId,
        studyTitle: study.title,
        subject: study.subject,
        kind: "flashcards",
        title: `Revisar flashcards · ${study.title}`,
        reason: `${dueFlashcards.length} flashcard(s) pendente(s) no ciclo SM-2`,
        priority: manualPriority ?? mapScoreToPriority(score),
        priorityScore: score,
        estimatedMinutes: clampItemMinutes(15 + dueFlashcards.length * 2, 20),
        completed: false,
        targetHref: buildTargetHref(study.studyId, "flashcards"),
        preferredMaxDay: 1,
      });
    }

    if (knowledge.classification === "difficult") {
      const score = clampNumber(baseScore + 22, 10, 100, 75);
      pushCandidate({
        id: `${study.studyId}:tutor:general`,
        studyId: study.studyId,
        studyTitle: study.title,
        subject: study.subject,
        kind: "tutor",
        title: `Reforçar ponto difícil com Tutor · ${study.title}`,
        reason: `Domínio atual em ${Math.round(knowledge.knowledge)}% (dificuldade detectada)`,
        priority: manualPriority ?? mapScoreToPriority(score),
        priorityScore: score,
        estimatedMinutes: 25,
        completed: false,
        targetHref: buildTargetHref(study.studyId, "tutor"),
      });
    } else if (study.progress < 100 || knowledge.classification === "forgotten" || knowledge.classification === "never_studied") {
      const needsReading = study.progress < 50 || knowledge.classification === "never_studied";
      const kind = needsReading ? "study_reading" : "practice_quiz";
      const score = clampNumber(baseScore + (study.progress === 0 ? 8 : 12), 10, 100, 55);
      pushCandidate({
        id: `${study.studyId}:${kind}:general`,
        studyId: study.studyId,
        studyTitle: study.title,
        subject: study.subject,
        kind,
        title: needsReading ? `Avançar estudo · ${study.title}` : `Praticar questões · ${study.title}`,
        reason:
          calculatedPriority.reasons[0] ??
          `Progresso em ${Math.round(study.progress)}% (${study.subject})`,
        priority: manualPriority ?? mapScoreToPriority(score),
        priorityScore: score,
        estimatedMinutes: needsReading ? 30 : 20,
        completed: false,
        targetHref: buildTargetHref(study.studyId, needsReading ? "leitura" : "quiz"),
      });
    } else if (
      studyExams.length === 0 &&
      dueReviews.length === 0 &&
      dueFlashcards.length === 0 &&
      studyPendingErrors.length === 0
    ) {
      const score = clampNumber(baseScore, 10, 100, 35);
      pushCandidate({
        id: `${study.studyId}:practice_quiz:general`,
        studyId: study.studyId,
        studyTitle: study.title,
        subject: study.subject,
        kind: "practice_quiz",
        title: `Manutenção de domínio · ${study.title}`,
        reason: calculatedPriority.reasons[0] ?? "Tema concluído · revisão rápida recomendada",
        priority: manualPriority ?? mapScoreToPriority(score),
        priorityScore: score,
        estimatedMinutes: 20,
        completed: false,
        targetHref: buildTargetHref(study.studyId, "quiz"),
      });
    }
  }

  for (const { exam, daysLeft } of upcomingExams) {
    if (linkedExamIds.has(exam.id)) continue;
    const matched = matchExamToStudy(exam, signals.studies);
    if (matched && selectedSet.size > 0 && !selectedSet.has(matched.studyId)) {
      continue;
    }

    const urgency = daysLeft <= 2 ? 95 : daysLeft <= 6 ? 84 : daysLeft <= 14 ? 72 : 56;
    const score = clampNumber(urgency + (config.preferredFocus === "exams" ? 10 : 0), 10, 100, 75);

    pushCandidate({
      id: `${matched?.studyId ?? `exam-${exam.id}`}:exam_prep:${exam.id}`,
      studyId: matched?.studyId,
      studyTitle: matched?.title ?? exam.title,
      subject: matched?.subject ?? exam.discipline,
      kind: "exam_prep",
      title: `Revisar para prova · ${exam.title}`,
      reason: buildExamReason(exam, daysLeft),
      priority: mapScoreToPriority(score),
      priorityScore: score,
      estimatedMinutes: clampItemMinutes(Math.min(45, Math.max(20, exam.dailyMinutes || 30)), 30),
      completed: false,
      examId: exam.id,
      examTitle: exam.title,
      targetHref: `/provas?prova=${encodeURIComponent(exam.id)}`,
      preferredMaxDay: Math.max(0, daysLeft),
    });
  }

  return candidates.sort((left, right) => {
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
    if ((left.preferredMaxDay ?? 999) !== (right.preferredMaxDay ?? 999)) {
      return (left.preferredMaxDay ?? 999) - (right.preferredMaxDay ?? 999);
    }
    return left.title.localeCompare(right.title, "pt-BR");
  });
}

function allocateAcrossDays(
  candidates: readonly CandidateTask[],
  dailyMinutes: number,
  horizonDays: number,
  now: Date,
  previousById: ReadonlyMap<string, StudyPlanItem>,
): StudyPlanItem[] {
  const dayMinutes = Array.from({ length: horizonDays }, () => 0);
  const scheduled: StudyPlanItem[] = [];

  for (const candidate of candidates.slice(0, MAX_PLAN_ITEMS)) {
    const previous = previousById.get(candidate.id);
    const estimatedMinutes = previous ? previous.estimatedMinutes : candidate.estimatedMinutes;
    const maxPreferred =
      candidate.preferredMaxDay !== undefined
        ? Math.min(horizonDays - 1, Math.max(0, candidate.preferredMaxDay))
        : horizonDays - 1;

    let chosenDay = -1;

    for (let day = 0; day <= maxPreferred; day += 1) {
      if (dayMinutes[day] === 0 || dayMinutes[day] + estimatedMinutes <= dailyMinutes) {
        chosenDay = day;
        break;
      }
    }

    if (chosenDay === -1) {
      for (let day = 0; day < horizonDays; day += 1) {
        if (dayMinutes[day] === 0 || dayMinutes[day] + estimatedMinutes <= dailyMinutes) {
          chosenDay = day;
          break;
        }
      }
    }

    if (chosenDay === -1) {
      let minLoad = Number.POSITIVE_INFINITY;
      for (let day = 0; day <= maxPreferred; day += 1) {
        if (dayMinutes[day] < minLoad) {
          minLoad = dayMinutes[day];
          chosenDay = day;
        }
      }
    }

    if (chosenDay === -1) chosenDay = 0;
    dayMinutes[chosenDay] += estimatedMinutes;

    const { preferredMaxDay: _ignored, ...rest } = candidate;
    void _ignored;

    scheduled.push({
      ...rest,
      estimatedMinutes,
      dayOffset: chosenDay,
      dateStr: addLocalDays(now, chosenDay),
      completed: previous?.completed ?? false,
      completedAt: previous?.completedAt,
    });
  }

  return scheduled.sort((left, right) => {
    if (left.dayOffset !== right.dayOffset) return left.dayOffset - right.dayOffset;
    return right.priorityScore - left.priorityScore;
  });
}

export const PlanningEngine = {
  generate(
    partialConfig: Partial<StudyPlanConfig>,
    signals: PlanningSignalInput,
    existingPlan?: StudyPlan | null,
  ): StudyPlan {
    const now = signals.now ?? new Date();
    const dailyMinutes = clampDailyMinutes(
      partialConfig.dailyMinutes ?? existingPlan?.dailyMinutes,
      60,
    );
    const horizonDays = clampHorizonDays(
      partialConfig.horizonDays ?? existingPlan?.horizonDays,
      7,
    );

    const config: StudyPlanConfig = {
      title: sanitizeText(partialConfig.title ?? existingPlan?.title, 100, "Plano de Estudos") || "Plano de Estudos",
      goal: sanitizeText(partialConfig.goal ?? existingPlan?.goal, 240, ""),
      dailyMinutes,
      horizonDays,
      includeExams: partialConfig.includeExams ?? existingPlan?.includeExams ?? true,
      preferredFocus: partialConfig.preferredFocus ?? existingPlan?.preferredFocus ?? "balanced",
      selectedStudyIds: Array.from(
        new Set(partialConfig.selectedStudyIds ?? existingPlan?.selectedStudyIds ?? []),
      ),
      manualStudyPriorities: {
        ...(existingPlan?.manualStudyPriorities ?? {}),
        ...(partialConfig.manualStudyPriorities ?? {}),
      },
    };

    const previousById = new Map<string, StudyPlanItem>(
      (existingPlan?.items ?? []).map((item) => [item.id, item]),
    );
    const candidates = createCandidates(config, signals, now);
    const items = allocateAcrossDays(candidates, dailyMinutes, horizonDays, now, previousById);
    const nowIso = now.toISOString();

    return {
      version: 1,
      id: existingPlan?.id ?? `plan-${now.getTime()}`,
      ...config,
      items,
      createdAt: existingPlan?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
  },

  reconcileWithCurrentSources(
    plan: StudyPlan,
    studies: readonly StudyRecord[],
    exams: readonly Exam[],
  ): StudyPlan {
    const studyIds = new Set(studies.map((study) => study.studyId));
    const examIds = new Set(exams.map((exam) => exam.id));

    let changed = false;
    const nextItems = plan.items.map((item) => {
      const missingStudy = Boolean(item.studyId && !studyIds.has(item.studyId));
      const missingExam = Boolean(item.examId && !examIds.has(item.examId));
      const unavailable = missingStudy || missingExam;

      if (Boolean(item.sourceUnavailable) === unavailable) return item;
      changed = true;
      return {
        ...item,
        sourceUnavailable: unavailable || undefined,
      };
    });

    if (!changed) return plan;
    return {
      ...plan,
      items: nextItems,
    };
  },
};
