import { NotesService } from "@/features/notes/NotesService";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { SummaryStorage } from "@/features/summaries/services/SummaryStorage";
import { ContentStorage } from "@/features/extraction/ContentStorage";
import type { TutorStudyContext } from "@/types/tutor-context";

export const TutorContextService = {
  loadCurrent(): TutorStudyContext | null {
    const study = StudyEngine.load()
      .sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))[0];
    if (!study) return null;
    const summary = (SummaryStorage.load() ?? [])
      .filter((item) => item.studyId === study.studyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const notes = NotesService.load()
      .filter((note) => note.studyId === study.studyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ title, content }) => ({ title, content }));
    const extracted = ContentStorage.load().records
      .filter((record) => record.studyId === study.studyId && record.status === "extracted")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    return {
      studyId: study.studyId,
      title: study.title,
      subject: study.subject,
      topic: study.title,
      status: study.status,
      progress: study.progress,
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
          }
        : study.initialSummary
          ? {
              title: study.detectedTitle,
              subject: study.detectedSubject,
              topic: study.detectedTopic,
              summaryPreview: study.initialSummary,
              keywords: study.keywords ?? [],
              language: study.language,
            }
          : undefined,
    };
  },
};
