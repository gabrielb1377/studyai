import { NotesService } from "@/features/notes/NotesService";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { SummaryStorage } from "@/features/summaries/services/SummaryStorage";
import { ContentStorage } from "@/features/extraction/ContentStorage";
import type { TutorStudyContext } from "@/types/tutor-context";
import { FlashcardService } from "@/features/flashcards/FlashcardService";
import { QuizService } from "@/features/quiz/QuizService";
import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";
import { LearningStorage } from "@/features/learning/LearningStorage";
import { StudyPriorityEngine } from "@/features/learning/StudyPriorityEngine";

export const TutorContextService = {
  async loadCurrent(): Promise<TutorStudyContext | null> {
    const study = (await StudyEngine.load())
      .sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))[0];
    if (!study) return null;
    const [storedSummaries, storedNotes, storedContents, flashcards, quizzes, profile] = await Promise.all([
      SummaryStorage.load(),
      NotesService.load(),
      ContentStorage.load(),
      FlashcardService.load(),
      QuizService.load(),
      LearningStorage.load(),
    ]);
    const summary = (storedSummaries ?? [])
      .filter((item) => item.studyId === study.studyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const notes = storedNotes
      .filter((note) => note.studyId === study.studyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ title, content }) => ({ title, content }));
    const extracted = storedContents.records
      .filter((record) => record.studyId === study.studyId && record.status === "extracted")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const knowledge = KnowledgeEngine.calculate(study, profile, flashcards, quizzes.results);
    const priority = StudyPriorityEngine.calculate(study, knowledge, profile, flashcards);

    return {
      studyId: study.studyId,
      title: study.title,
      subject: study.subject,
      topic: study.title,
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
          }
        : study.initialSummary
          ? {
              title: study.detectedTitle,
              subject: study.detectedSubject,
              topic: study.detectedTopic,
              summaryPreview: study.initialSummary,
              keywords: study.keywords ?? [],
              language: study.language,
              subtopics: study.subtopics ?? [],
              chapterCount: study.chapters?.length ?? 0,
            }
          : undefined,
    };
  },
};
