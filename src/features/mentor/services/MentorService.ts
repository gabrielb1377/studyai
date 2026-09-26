import { FlashcardService } from "@/features/flashcards/FlashcardService";
import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";
import { LearningService } from "@/features/learning/LearningService";
import { LearningStorage } from "@/features/learning/LearningStorage";
import { StudyPriorityEngine } from "@/features/learning/StudyPriorityEngine";
import { QuizService } from "@/features/quiz/QuizService";
import { KnowledgeStorage } from "@/features/semantic/KnowledgeStorage";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";
import { TutorService } from "@/features/tutor/services/TutorService";
import type { TutorStudyContext } from "@/types/tutor-context";
import type { MentorSession } from "../types";
import { MentorStorage } from "./MentorStorage";
import { RecommendationEngine } from "./RecommendationEngine";
import { SessionEngine } from "./SessionEngine";
import { SocraticEngine } from "./SocraticEngine";

async function evidence(studyId: string) {
  const [studies, profile, flashcards, quizStore, graphs, snapshot] = await Promise.all([
    StudyEngine.load(), LearningStorage.load(), FlashcardService.load(), QuizService.load(), KnowledgeStorage.getByStudyId(studyId), MentorStorage.load(),
  ]);
  const study = studies.find((item) => item.studyId === studyId);
  if (!study) throw new Error("O tema selecionado não está mais disponível.");
  const knowledge = KnowledgeEngine.calculate(study, profile, flashcards, quizStore.results);
  const priority = StudyPriorityEngine.calculate(study, knowledge, profile, flashcards);
  return { study, studies, profile, flashcards, quizzes: quizStore.results, graphs, snapshot, knowledge, priority };
}

export const MentorService = {
  async startSession(studyId: string) {
    const data = await evidence(studyId);
    const session = SessionEngine.start({ ...data, goals: data.snapshot.goals });
    await MentorStorage.save({ ...data.snapshot, sessions: [session, ...data.snapshot.sessions.filter((item) => item.id !== session.id)] });
    LearningService.enqueueActivity({ type: "tutor", studyId });
    return session;
  },

  async answer(sessionId: string, answer: string) {
    const snapshot = await MentorStorage.load();
    const current = snapshot.sessions.find((session) => session.id === sessionId);
    if (!current) throw new Error("A sessão guiada não foi encontrada.");
    const data = await evidence(current.studyId);
    const last = current.turns.at(-1);
    const evaluation = last ? SocraticEngine.evaluate(last.question, answer) : undefined;
    const nextQuestion = SocraticEngine.createQuestion(data.study, data.graphs, current.level, current.turns.length);
    if (evaluation?.followUpQuestion) nextQuestion.prompt = evaluation.followUpQuestion;
    const session = {
      ...SessionEngine.answer(current, answer, nextQuestion),
      level: data.knowledge.mastery,
      knowledge: data.knowledge.knowledge,
      priority: data.priority,
    };
    await MentorStorage.save({ ...data.snapshot, sessions: data.snapshot.sessions.map((item) => item.id === session.id ? session : item) });
    LearningService.enqueueActivity({ type: "tutor", studyId: session.studyId, correctAnswers: evaluation?.result === "correct" ? 1 : 0, wrongAnswers: evaluation?.result === "incorrect" ? 1 : 0 });
    return session;
  },

  async setStatus(sessionId: string, status: MentorSession["status"]) {
    const snapshot = await MentorStorage.load();
    const sessions = snapshot.sessions.map((session) => session.id === sessionId ? SessionEngine.setStatus(session, status) : session);
    await MentorStorage.save({ ...snapshot, sessions });
    return sessions.find((session) => session.id === sessionId);
  },

  async explain(sessionId: string) {
    const stored = await MentorStorage.load();
    const storedSession = stored.sessions.find((item) => item.id === sessionId);
    if (!storedSession) throw new Error("A sessão guiada não foi encontrada.");
    const data = await evidence(storedSession.studyId);
    const session = data.snapshot.sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error("A sessão guiada não foi encontrada.");
    const turnIndex = session.turns.findLastIndex((turn) => Boolean(turn.evaluation));
    const turn = session.turns[turnIndex];
    if (!turn) throw new Error("Responda uma pergunta antes de solicitar outra explicação.");
    const retrieval = await RetrievalPipeline.forQuestion(turn.question.concept, session.studyId);
    const context: TutorStudyContext = {
      studyId: data.study.studyId,
      title: data.study.title,
      subject: data.study.subject,
      topic: data.study.title,
      status: data.study.status,
      progress: data.study.progress,
      learning: {
        knowledge: data.knowledge.knowledge,
        confidence: data.knowledge.confidence,
        mastery: data.knowledge.mastery,
        classification: data.knowledge.classification,
        priority: data.priority.level,
        reasons: data.priority.reasons,
      },
      notes: [],
      document: {
        title: data.study.detectedTitle,
        subject: data.study.detectedSubject,
        topic: data.study.detectedTopic,
        summaryPreview: data.study.initialSummary,
        keywords: data.study.keywords ?? [],
        language: data.study.language,
        subtopics: data.study.subtopics ?? [],
        chapterCount: data.study.chapters?.length ?? 0,
        chapters: (data.study.chapters ?? []).map(({ title, marker, page, slide }) => ({ title, marker, page, slide })),
      },
    };
    const response = await TutorService.requestReply(
      [],
      `Atue como Mentor socrático. Explique novamente o conceito "${turn.question.concept}" em linguagem ${session.level.toLowerCase()}, usando o contexto recuperado. Não entregue apenas uma resposta pronta: termine com uma pergunta curta que ajude o aluno a raciocinar.`,
      context,
      retrieval.chunks,
    );
    const updated: MentorSession = {
      ...session,
      turns: session.turns.map((item, index) => index === turnIndex ? { ...item, mentorExplanation: response.text, provider: response.provider, model: response.model } : item),
      updatedAt: new Date().toISOString(),
    };
    await MentorStorage.save({ ...data.snapshot, sessions: data.snapshot.sessions.map((item) => item.id === sessionId ? updated : item) });
    return updated;
  },

  async refreshRecommendations(studyId: string) {
    const data = await evidence(studyId);
    const recommendations = await RecommendationEngine.inBackground(() => RecommendationEngine.calculate({ ...data, goals: data.snapshot.goals }));
    const other = data.snapshot.recommendations.filter((item) => item.studyId !== studyId);
    await MentorStorage.save({ ...data.snapshot, recommendations: [...recommendations, ...other] });
    return recommendations;
  },

  evidence,
};
