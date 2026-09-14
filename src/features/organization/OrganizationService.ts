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

type InferredDestination = Pick<MaterialDestination, "subject" | "topic"> &
  Partial<Pick<MaterialDestination, "course" | "semester">>;

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function sameDestination(material: Material, destination: InferredDestination) {
  return normalized(material.course ?? "") === normalized(destination.course ?? "") &&
    normalized(material.semester ?? "") === normalized(destination.semester ?? "") &&
    normalized(material.subject ?? "") === normalized(destination.subject) &&
    normalized(material.topic ?? "") === normalized(destination.topic);
}

function titleFromSegment(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferMaterialDestination(material: Pick<Material, "name" | "relativePath">): InferredDestination {
  const path = material.relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const folders = path.split("/").filter(Boolean).slice(0, -1).map(titleFromSegment);
  const topicFromName = titleFromSegment(material.name) || "Material importado";

  if (folders.length >= 4) {
    return {
      course: folders[0],
      semester: folders[1],
      subject: folders.at(-2) ?? folders[2],
      topic: folders.at(-1) ?? topicFromName,
    };
  }
  if (folders.length === 3) {
    return {
      course: folders[0],
      subject: folders[1],
      topic: folders[2],
    };
  }
  if (folders.length === 2) {
    return { subject: folders[0], topic: folders[1] };
  }
  if (folders.length === 1) {
    return { subject: folders[0], topic: topicFromName };
  }
  return { subject: "Materiais importados", topic: topicFromName };
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
  organizeImported(materialId: string) {
    const material = MaterialService.findById(materialId);
    if (!material) throw new Error("O material importado não foi encontrado.");

    const destination = inferMaterialDestination(material);
    const matchingStudy = MaterialService.load().find((candidate) =>
      candidate.id !== material.id && candidate.studyId && sameDestination(candidate, destination),
    );
    const studyId = material.studyId && sameDestination(material, destination)
      ? material.studyId
      : matchingStudy?.studyId ?? crypto.randomUUID();
    const updated = MaterialService.update(material.id, { ...destination, studyId });
    if (!updated) throw new Error("Não foi possível vincular o material ao estudo.");

    StudyEngine.save(StudyEngine.syncMaterial(StudyEngine.load(), updated));
    return { ...updated, studyId };
  },

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
