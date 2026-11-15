import { NotesService } from "@/features/notes/NotesService";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { SummaryStorage } from "@/features/summaries/services/SummaryStorage";
import { ContentStorage } from "@/features/extraction/ContentStorage";
import { contentNeedsTutorReview } from "@/features/ocr/exercise-review";
import type { TutorStudyContext } from "@/types/tutor-context";
import { FlashcardService } from "@/features/flashcards/FlashcardService";
import { QuizService } from "@/features/quiz/QuizService";
import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";
import { LearningStorage } from "@/features/learning/LearningStorage";
import { StudyPriorityEngine } from "@/features/learning/StudyPriorityEngine";
import { MentorStorage } from "@/features/mentor/services/MentorStorage";
import { ErrorNotebookStorage } from "@/features/learning/errors/ErrorNotebookStorage";
import { LongTermMemoryStorage } from "@/features/learning/memory/LongTermMemoryStorage";
import { MemoryRetrievalEngine } from "@/features/learning/memory/MemoryRetrievalEngine";

export const TutorContextService = {
  async loadCurrent(requestedStudyId?: string): Promise<TutorStudyContext | null> {
    const studies = await StudyEngine.load();
    const study = requestedStudyId
      ? studies.find((item) => item.studyId === requestedStudyId)
      : studies.sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))[0];
    if (!study) return null;
    const [storedSummaries, storedNotes, storedContents, flashcards, quizzes, profile, mentor, memoryState, rawErrors] = await Promise.all([
      SummaryStorage.load(),
      NotesService.load(),
      ContentStorage.load(),
      FlashcardService.load(),
      QuizService.load(),
      LearningStorage.load(),
      MentorStorage.load(),
      LongTermMemoryStorage.load(),
      ErrorNotebookStorage.load(),
    ]);
    const summary = (storedSummaries ?? [])
      .filter((item) => item.studyId === study.studyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const notes = storedNotes
      .filter((note) => note.studyId === study.studyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ title, content }) => ({ title, content }));
    const studyContents = storedContents.records.filter((record) =>
      record.studyId === study.studyId || study.materialIds.includes(record.fileId));
    const pendingReview = studyContents.some(contentNeedsTutorReview);
    const extracted = studyContents
      .filter((record) => record.status === "extracted" && !contentNeedsTutorReview(record))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const knowledge = KnowledgeEngine.calculate(study, profile, flashcards, quizzes.results);
    const priority = StudyPriorityEngine.calculate(study, knowledge, profile, flashcards);
    const lastMentorSession = mentor.sessions
      .filter((session) => session.studyId === study.studyId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const mentorRecommendations = mentor.recommendations
      .filter((recommendation) => recommendation.studyId === study.studyId)
      .slice(0, 3)
      .map(({ title, reason, priority: recommendationPriority }) => ({ title, reason, priority: recommendationPriority }));
    const reconciledErrors = ErrorNotebookStorage.reconcileWithStudies(rawErrors, studies);
    const reconciledMemories = {
      ...memoryState,
      entries: LongTermMemoryStorage.reconcileWithStudies(memoryState.entries, studies),
    };
    const memory = MemoryRetrievalEngine.selectForTutor({
      state: reconciledMemories,
      errorEntries: reconciledErrors,
      studyId: study.studyId,
      subject: study.subject,
    });

    return {
      studyId: study.studyId,
      title: pendingReview ? "Estudo com extração pendente de revisão" : study.title,
      subject: pendingReview ? "Não confirmada" : study.subject,
      topic: pendingReview ? "Não confirmado" : study.title,
      status: study.status,
      progress: study.progress,
      learning: {
        knowledge: knowledge.knowledge,
        confidence: knowledge.confidence,
        mastery: knowledge.mastery,
        classification: knowledge.classification,
        priority: priority.level,
        reasons: priority.reasons,
      },
      summary: summary
        ? { title: summary.title, content: summary.content }
        : undefined,
      notes,
      document: extracted
        ? {
            title: extracted.metadata.title,
            subject: extracted.metadata.subject,
            topic: extracted.metadata.topic,
            summaryPreview: extracted.metadata.summaryPreview,
            keywords: extracted.metadata.keywords ?? [],
            language: extracted.metadata.language,
            subtopics: extracted.metadata.subtopics ?? [],
            chapterCount: extracted.metadata.chapters?.length ?? 0,
            chapters: (extracted.metadata.chapters ?? []).map(({ title, marker, page, slide }) => ({ title, marker, page, slide })),
          }
        : !pendingReview && study.initialSummary
          ? {
              title: study.detectedTitle,
              subject: study.detectedSubject,
              topic: study.detectedTopic,
              summaryPreview: study.initialSummary,
              keywords: study.keywords ?? [],
              language: study.language,
              subtopics: study.subtopics ?? [],
              chapterCount: study.chapters?.length ?? 0,
              chapters: (study.chapters ?? []).map(({ title, marker, page, slide }) => ({ title, marker, page, slide })),
            }
          : undefined,
      mentor: lastMentorSession || mentorRecommendations.length > 0
        ? {
            lastSessionStatus: lastMentorSession?.status,
            lastSessionAt: lastMentorSession?.updatedAt,
            recommendations: mentorRecommendations,
          }
        : undefined,
      memory,
    };
  },
};
