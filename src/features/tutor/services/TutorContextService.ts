import { NotesService } from "@/features/notes/NotesService";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { SummaryStorage } from "@/features/summaries/services/SummaryStorage";
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
    };
  },
};
