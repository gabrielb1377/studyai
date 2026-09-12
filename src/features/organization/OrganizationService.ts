import { ContentStorage } from "@/features/extraction/ContentStorage";
import { ChunkStorage } from "@/features/retrieval/ChunkStorage";
import { EmbeddingStorage } from "@/features/retrieval/EmbeddingStorage";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { FlashcardService } from "@/features/flashcards/FlashcardService";
import { NotesService } from "@/features/notes/NotesService";
import { QuizService } from "@/features/quiz/QuizService";
import { SummaryStorage } from "@/features/summaries/services/SummaryStorage";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import { MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";

export type MaterialDestination = {
  course: string;
  semester: string;
  subject: string;
  topic: string;
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function sameDestination(material: Material, destination: MaterialDestination) {
  return normalized(material.course ?? "") === normalized(destination.course) &&
    normalized(material.semester ?? "") === normalized(destination.semester) &&
    normalized(material.subject ?? "") === normalized(destination.subject) &&
    normalized(material.topic ?? "") === normalized(destination.topic);
}

function synchronizeEmbeddings() {
  EmbeddingStorage.synchronize(ChunkStorage.load().chunks);
}

function migrateStudyData(previousStudyId: string, studyId: string) {
  if (previousStudyId === studyId) return;
  const previousStillExists = StudyEngine.load().some((study) => study.studyId === previousStudyId);
  if (previousStillExists) return;

  NotesService.save(NotesService.load().map((note) => note.studyId === previousStudyId ? { ...note, studyId } : note));
  FlashcardService.save(FlashcardService.load().map((card) => card.studyId === previousStudyId ? { ...card, studyId } : card));
  const quiz = QuizService.load();
  QuizService.save({
    questions: quiz.questions.map((question) => question.studyId === previousStudyId ? { ...question, studyId } : question),
    results: quiz.results.map((result) => result.studyId === previousStudyId ? { ...result, studyId } : result),
  });
  SummaryStorage.save((SummaryStorage.load() ?? []).map((summary) =>
    summary.studyId === previousStudyId ? { ...summary, studyId } : summary,
  ));
}

export const OrganizationService = {
  rename(materialId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return null;

    const material = MaterialService.update(materialId, { name: nextName });
    if (!material) return null;
    ContentStorage.updateFile(material.fileId, { name: nextName });
    ChunkStorage.updateFile(material.fileId, { sourceName: nextName });
    return material;
  },

  move(materialId: string, destination: MaterialDestination) {
    const material = MaterialService.findById(materialId);
    if (!material) return null;

    const completeDestination = Object.fromEntries(
      Object.entries(destination).map(([key, value]) => [key, value.trim()]),
    ) as MaterialDestination;
    if (Object.values(completeDestination).some((value) => !value)) return null;

    const matchingStudy = MaterialService.load().find((candidate) =>
      candidate.id !== material.id && candidate.studyId && sameDestination(candidate, completeDestination),
    );
    const studyId = sameDestination(material, completeDestination) && material.studyId
      ? material.studyId
      : matchingStudy?.studyId ?? crypto.randomUUID();
    const updated = MaterialService.update(materialId, { ...completeDestination, studyId });
    if (!updated) return null;

    ContentStorage.updateFile(material.fileId, { studyId });
    ChunkStorage.updateFile(material.fileId, { studyId });
    synchronizeEmbeddings();

    const withoutOldAssociation = StudyEngine.removeMaterial(
      StudyEngine.load(),
      material.studyId,
      material.id,
    );
    StudyEngine.save(StudyEngine.syncMaterial(withoutOldAssociation, updated));
    if (material.studyId) migrateStudyData(material.studyId, studyId);
    return updated;
  },

  remove(materialId: string) {
    const material = MaterialService.findById(materialId);
    if (!material) return false;

    ContentStorage.removeByFileId(material.fileId);
    ChunkStorage.removeByFileId(material.fileId);
    synchronizeEmbeddings();
    MaterialRuntimeStore.remove(material.id);
    MaterialService.remove(material.id);
    StudyEngine.save(StudyEngine.removeMaterial(StudyEngine.load(), material.studyId, material.id));
    return true;
  },
};
