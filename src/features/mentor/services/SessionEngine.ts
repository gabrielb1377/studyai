import type { KnowledgeGraph } from "@/features/semantic/types";
import type { KnowledgeScore, StudyPriority } from "@/features/learning/types";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import type { MentorGoal, MentorPlanStep, MentorSession } from "../types";
import { ReviewScheduler } from "@/features/learning/ReviewScheduler";
import { SocraticEngine } from "./SocraticEngine";

function buildPlan(study: StudyRecord, knowledge: KnowledgeScore, flashcards: readonly Flashcard[], quizzes: readonly QuizResult[], goals: readonly MentorGoal[]): MentorPlanStep[] {
  const due = flashcards.filter((card) => card.studyId === study.studyId && ReviewScheduler.isDue(card)).length;
  const latestQuiz = quizzes.filter((quiz) => quiz.studyId === study.studyId).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const steps: Omit<MentorPlanStep, "id" | "status">[] = [];
  if (knowledge.classification !== "strong") steps.push({ type: "reading", title: "Revisar o material", description: study.chapters?.[0]?.title ?? study.title, estimatedMinutes: Math.min(20, study.readingTimeMinutes ?? 10) });
  steps.push({ type: "question", title: "Explicar com suas palavras", description: "O Mentor verificará sua compreensão sem entregar a resposta.", estimatedMinutes: 5 });
  if (due > 0) steps.push({ type: "flashcards", title: `Revisar ${due} flashcards`, description: "Revisão espaçada pendente.", estimatedMinutes: Math.max(3, Math.ceil(due * 0.5)) });
  if (!latestQuiz || latestQuiz.score < 85) steps.push({ type: "quiz", title: "Validar com um quiz", description: latestQuiz ? `Melhorar o resultado atual de ${latestQuiz.score}%.` : "Criar a primeira evidência de desempenho.", estimatedMinutes: 10 });
  if (goals.some((goal) => goal.status === "active" && (!goal.studyId || goal.studyId === study.studyId))) steps.push({ type: "review", title: "Atualizar a meta", description: "Registrar o avanço desta sessão.", estimatedMinutes: 2 });
  return steps.slice(0, 5).map((step, index) => ({ ...step, id: `mentor-step-${index}`, status: index === 0 ? "active" : "pending" }));
}

export const SessionEngine = {
  start(input: { study: StudyRecord; knowledge: KnowledgeScore; priority: StudyPriority; graphs: readonly KnowledgeGraph[]; flashcards: readonly Flashcard[]; quizzes: readonly QuizResult[]; goals: readonly MentorGoal[]; now?: string }): MentorSession {
    const now = input.now ?? new Date().toISOString();
    const question = SocraticEngine.createQuestion(input.study, input.graphs, input.knowledge.mastery);
    return {
      id: `mentor-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      studyId: input.study.studyId,
      subject: input.study.subject,
      topic: input.study.title,
      status: "active",
      level: input.knowledge.mastery,
      knowledge: input.knowledge.knowledge,
      priority: input.priority,
      plan: buildPlan(input.study, input.knowledge, input.flashcards, input.quizzes, input.goals),
      currentStepIndex: 0,
      turns: [{ id: `mentor-turn-${Date.now()}`, question, createdAt: now }],
      startedAt: now,
      updatedAt: now,
    };
  },

  answer(session: MentorSession, answer: string, nextQuestion?: MentorSession["turns"][number]["question"]): MentorSession {
    const now = new Date().toISOString();
    const evaluation = session.turns.at(-1) ? SocraticEngine.evaluate(session.turns.at(-1)!.question, answer, now) : undefined;
    const turns = session.turns.map((turn, index) => index === session.turns.length - 1
      ? { ...turn, answer, evaluation }
      : turn);
    if (nextQuestion) turns.push({ id: `mentor-turn-${Date.now()}`, question: nextQuestion, createdAt: now });
    const currentStepIndex = evaluation?.result === "correct"
      ? Math.min(session.plan.length - 1, session.currentStepIndex + 1)
      : session.currentStepIndex;
    const plan = session.plan.map((step, index) => ({ ...step, status: index < currentStepIndex ? "completed" as const : index === currentStepIndex ? "active" as const : "pending" as const }));
    return { ...session, turns, plan, currentStepIndex, updatedAt: now };
  },

  setStatus(session: MentorSession, status: MentorSession["status"]): MentorSession {
    const now = new Date().toISOString();
    return { ...session, status, updatedAt: now, completedAt: status === "completed" ? now : session.completedAt };
  },
};
