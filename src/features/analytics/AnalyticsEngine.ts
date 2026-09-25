import type { LearningActivity } from "@/features/learning/types";
import type {
  AnalyticsBreakdown,
  AnalyticsInsight,
  AnalyticsInput,
  AnalyticsPeriodPoint,
  AnalyticsSnapshot,
  ForgettingMetric,
  PeriodComparison,
  RetentionMetric,
} from "./types";

const DAY = 86_400_000;
const cache = new Map<string, AnalyticsSnapshot>();

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function localKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function sumMinutes(activities: readonly LearningActivity[], start: Date, end: Date) {
  return activities.reduce((total, activity) => {
    const occurredAt = new Date(activity.occurredAt);
    return occurredAt >= start && occurredAt < end ? total + activity.durationMinutes : total;
  }, 0);
}

function comparison(activities: readonly LearningActivity[], start: Date, durationDays: number): PeriodComparison {
  const end = new Date(start.getTime() + durationDays * DAY);
  const previousStart = new Date(start.getTime() - durationDays * DAY);
  const currentMinutes = sumMinutes(activities, start, end);
  const previousMinutes = sumMinutes(activities, previousStart, start);
  return {
    currentMinutes: Number(currentMinutes.toFixed(1)),
    previousMinutes: Number(previousMinutes.toFixed(1)),
    deltaPercent: previousMinutes > 0 ? Math.round((currentMinutes - previousMinutes) / previousMinutes * 100) : null,
  };
}

function monthComparison(activities: readonly LearningActivity[], now: Date): PeriodComparison {
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const currentMinutes = sumMinutes(activities, currentStart, currentEnd);
  const previousMinutes = sumMinutes(activities, previousStart, currentStart);
  return {
    currentMinutes: Number(currentMinutes.toFixed(1)),
    previousMinutes: Number(previousMinutes.toFixed(1)),
    deltaPercent: previousMinutes > 0 ? Math.round((currentMinutes - previousMinutes) / previousMinutes * 100) : null,
  };
}

function periodSeries(activities: readonly LearningActivity[], now: Date, mode: "week" | "month"): AnalyticsPeriodPoint[] {
  const count = mode === "week" ? 8 : 6;
  const formatter = mode === "week"
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" })
    : new Intl.DateTimeFormat("pt-BR", { month: "short" });
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    const start = mode === "week" ? startOfWeek(now) : new Date(now.getFullYear(), now.getMonth(), 1);
    if (mode === "week") start.setDate(start.getDate() - offset * 7);
    else start.setMonth(start.getMonth() - offset);
    const end = new Date(start);
    if (mode === "week") end.setDate(end.getDate() + 7);
    else end.setMonth(end.getMonth() + 1);
    const periodActivities = activities.filter((activity) => {
      const date = new Date(activity.occurredAt);
      return date >= start && date < end;
    });
    return {
      key: localKey(start),
      label: formatter.format(start).replace(".", ""),
      minutes: Number(periodActivities.reduce((total, item) => total + item.durationMinutes, 0).toFixed(1)),
      activities: periodActivities.length,
    };
  });
}

function breakdown(entries: Iterable<[string, number]>): AnalyticsBreakdown[] {
  const source = Array.from(entries).filter(([, minutes]) => minutes > 0).sort((left, right) => right[1] - left[1]);
  const total = source.reduce((sum, [, minutes]) => sum + minutes, 0);
  return source.map(([label, minutes]) => ({
    id: label.toLocaleLowerCase("pt-BR").replace(/\s+/g, "-"),
    label,
    minutes: Number(minutes.toFixed(1)),
    percentage: total > 0 ? Math.round(minutes / total * 100) : 0,
  }));
}

function subjectRetention(input: AnalyticsInput): RetentionMetric[] {
  const subjects = new Map<string, { weighted: number; evidence: number }>();
  for (const score of input.knowledge) {
    const current = subjects.get(score.subject) ?? { weighted: 0, evidence: 0 };
    const evidence = Math.max(1, score.confidence);
    subjects.set(score.subject, { weighted: current.weighted + score.knowledge * evidence, evidence: current.evidence + evidence });
  }
  return Array.from(subjects, ([label, metric]) => ({
    id: `subject-${label}`,
    label,
    scope: "subject" as const,
    value: clamp(metric.weighted / metric.evidence),
    evidence: clamp(metric.evidence / Math.max(1, input.knowledge.length)),
    estimated: false,
  }));
}

function conceptRetention(input: AnalyticsInput): RetentionMetric[] {
  const scores = new Map(input.knowledge.map((score) => [score.studyId, score]));
  const concepts = new Map<string, { total: number; evidence: number; count: number }>();
  for (const graph of input.graphs) {
    const score = scores.get(graph.studyId);
    if (!score) continue;
    for (const concept of graph.concepts) {
      const current = concepts.get(concept.normalizedName) ?? { total: 0, evidence: 0, count: 0 };
      concepts.set(concept.normalizedName, {
        total: current.total + score.knowledge,
        evidence: current.evidence + score.confidence,
        count: current.count + 1,
      });
    }
  }
  return Array.from(concepts, ([id, metric]) => ({
    id: `concept-${id}`,
    label: input.graphs.flatMap((graph) => graph.concepts).find((concept) => concept.normalizedName === id)?.name ?? id,
    scope: "concept" as const,
    value: clamp(metric.total / metric.count),
    evidence: clamp(metric.evidence / metric.count),
    estimated: true,
  })).sort((left, right) => left.value - right.value).slice(0, 12);
}

function chapterRetention(input: AnalyticsInput): RetentionMetric[] {
  const scores = new Map(input.knowledge.map((score) => [score.studyId, score]));
  return input.studies.flatMap((study) => {
    const score = scores.get(study.studyId);
    if (!score) return [];
    return (study.chapters ?? []).map((chapter) => ({
      id: `chapter-${study.studyId}-${chapter.id}`,
      label: chapter.title,
      scope: "chapter" as const,
      value: score.knowledge,
      evidence: score.confidence,
      estimated: true,
    }));
  }).sort((left, right) => left.value - right.value).slice(0, 12);
}

function forgetting(input: AnalyticsInput, now: Date): ForgettingMetric[] {
  return input.knowledge.map((score) => {
    const topic = input.profile.topics[score.studyId];
    const lastActivityAt = topic?.lastAccessedAt;
    const daysSinceActivity = lastActivityAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / DAY))
      : undefined;
    const status = score.knowledge >= 75 && score.confidence >= 50
      ? "mastered" as const
      : (daysSinceActivity ?? Number.POSITIVE_INFINITY) >= 14 || score.components.recency < 45
        ? "forgetting" as const
        : "stable" as const;
    return {
      studyId: score.studyId,
      subject: score.subject,
      topic: score.topic,
      retention: score.knowledge,
      confidence: score.confidence,
      status,
      lastActivityAt,
      daysSinceActivity,
    };
  }).sort((left, right) => left.retention - right.retention);
}

function streaks(activities: readonly LearningActivity[]) {
  const days = Array.from(new Set(activities.map((activity) => localKey(activity.occurredAt)))).sort();
  let longest = 0;
  let running = 0;
  let previous: Date | undefined;
  for (const day of days) {
    const current = new Date(`${day}T12:00:00`);
    running = previous && Math.round((current.getTime() - previous.getTime()) / DAY) === 1 ? running + 1 : 1;
    longest = Math.max(longest, running);
    previous = current;
  }
  const last = days.at(-1);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const active = last === localKey(new Date()) || last === localKey(yesterday);
  return { current: active ? running : 0, longest };
}

function signature(input: AnalyticsInput, now: Date) {
  return [
    input.profile.updatedAt,
    input.studies.length,
    input.flashcards.length,
    input.quizzes.length,
    input.graphs.length,
    input.mentorSessions?.length ?? 0,
    localKey(now),
  ].join(":");
}

export const AnalyticsEngine = {
  build(input: AnalyticsInput): AnalyticsSnapshot {
    const now = input.now ?? new Date();
    const cacheKey = signature(input, now);
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const activities = input.profile.activities;
    const timeByTopic = breakdown(Object.values(input.profile.topics).map((topic) => [topic.topic, topic.timeMinutes]));
    const chapterMap = new Map<string, number>();
    for (const activity of activities) {
      const chapter = activity.chapter;
      if (chapter) chapterMap.set(chapter, (chapterMap.get(chapter) ?? 0) + activity.durationMinutes);
    }
    const retention = [...subjectRetention(input), ...conceptRetention(input), ...chapterRetention(input)];
    const forgettingMetrics = forgetting(input, now);
    const nextWeek = new Date(now.getTime() + 7 * DAY);
    const dueReviews = input.flashcards.filter((card) => card.nextReviewAt && new Date(card.nextReviewAt) >= now && new Date(card.nextReviewAt) <= nextWeek).length;
    const remainingStudyMinutes = input.studies.reduce((total, study) => total + Math.max(0, (study.readingTimeMinutes ?? 0) * (100 - study.progress) / 100), 0);
    const weekly = periodSeries(activities, now, "week");
    const monthly = periodSeries(activities, now, "month");
    const timeBySubject = breakdown(Object.entries(input.profile.timeBySubject));
    const hourTotals = activities.reduce<Record<number, number>>((result, activity) => {
      const hour = new Date(activity.occurredAt).getHours();
      result[hour] = (result[hour] ?? 0) + activity.durationMinutes;
      return result;
    }, {});
    const preferredHour = Object.entries(hourTotals).sort(([, left], [, right]) => right - left)[0]?.[0];
    const insights: AnalyticsInsight[] = [];
    const weakSubjects = timeBySubject.filter((subject) => {
      const weekStart = startOfWeek(now);
      return activities.filter((activity) => activity.subject === subject.label && new Date(activity.occurredAt) >= weekStart).length <= 1;
    });
    if (weakSubjects[0]) insights.push({ id: "low-frequency", tone: "attention" as const, title: "Frequência baixa nesta semana", description: `Você estudou ${weakSubjects[0].label} no máximo uma vez nesta semana.` });
    if (preferredHour !== undefined) insights.push({ id: "best-hour", tone: "positive" as const, title: "Horário mais frequente", description: `Seu maior volume de estudo foi registrado entre ${String(preferredHour).padStart(2, "0")}h e ${String(Number(preferredHour) + 1).padStart(2, "0")}h.` });
    const overdue = forgettingMetrics.filter((metric) => (metric.daysSinceActivity ?? 0) > 15).length;
    if (overdue > 0) insights.push({ id: "overdue", tone: "attention" as const, title: "Revisões atrasadas", description: `${overdue} ${overdue === 1 ? "tema está" : "temas estão"} sem atividade há mais de 15 dias.` });
    if (input.profile.activities.length === 0) insights.push({ id: "empty", tone: "neutral" as const, title: "Comece a construir seu histórico", description: "Os insights aparecerão depois das primeiras sessões registradas." });
    const timeline = [
      ...input.studies.filter((study) => study.status === "completed").map((study) => ({ id: `material-${study.studyId}`, type: "material" as const, title: "Material concluído", description: `${study.subject} · ${study.title}`, occurredAt: study.updatedAt })),
      ...input.quizzes.map((quiz) => ({ id: quiz.id, type: "quiz" as const, title: `Quiz concluído · ${quiz.score}%`, description: input.studies.find((study) => study.studyId === quiz.studyId)?.title ?? "Tema", occurredAt: quiz.completedAt })),
      ...input.flashcards.filter((card) => card.lastReviewedAt).map((card) => ({ id: `review-${card.id}`, type: "flashcard" as const, title: "Flashcard revisado", description: card.question, occurredAt: card.lastReviewedAt! })),
      ...activities.filter((activity) => activity.type === "reading").map((activity) => ({ id: activity.id, type: "session" as const, title: "Sessão de estudo", description: `${activity.topic} · ${Math.round(activity.durationMinutes)} min`, occurredAt: activity.occurredAt })),
      ...activities.filter((activity) => activity.type === "tutor").map((activity) => ({ id: activity.id, type: "tutor" as const, title: "Tutor utilizado", description: activity.topic, occurredAt: activity.occurredAt })),
      ...(input.mentorSessions ?? []).map((session) => ({ id: session.id, type: "mentor" as const, title: "Sessão com Mentor", description: `${session.subject} · ${session.topic}`, occurredAt: session.updatedAt })),
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 30);
    const heatmapBase = Array.from({ length: 84 }, (_, offset) => {
      const date = startOfDay(now);
      date.setDate(date.getDate() - (83 - offset));
      const key = localKey(date);
      const matches = activities.filter((activity) => localKey(activity.occurredAt) === key);
      return { date: key, minutes: Number(matches.reduce((sum, item) => sum + item.durationMinutes, 0).toFixed(1)), activities: matches.length };
    });
    const maxHeat = Math.max(1, ...heatmapBase.map((day) => day.minutes));
    const streak = streaks(activities);
    const weekStart = startOfWeek(now);
    const snapshot: AnalyticsSnapshot = {
      generatedAt: new Date().toISOString(),
      totalMinutes: Number(activities.reduce((sum, activity) => sum + activity.durationMinutes, 0).toFixed(1)),
      weekly,
      monthly,
      timeBySubject,
      timeByTopic,
      timeByChapter: breakdown(chapterMap.entries()),
      retention,
      forgetting: forgettingMetrics,
      forecast: { remainingStudyMinutes: Math.round(remainingStudyMinutes), reviewsNext7Days: dueReviews, sessionsBySubject: timeBySubject },
      insights,
      timeline,
      heatmap: heatmapBase.map((day) => ({ ...day, intensity: day.minutes === 0 ? 0 : Math.max(0.15, day.minutes / maxHeat) })),
      currentStreak: streak.current,
      longestStreak: streak.longest,
      weekComparison: comparison(activities, weekStart, 7),
      monthComparison: monthComparison(activities, now),
    };
    cache.clear();
    cache.set(cacheKey, snapshot);
    return snapshot;
  },
};
