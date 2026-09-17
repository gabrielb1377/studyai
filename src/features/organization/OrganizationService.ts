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
import type { ExtractionMetadata } from "@/features/extraction/ExtractionTypes";

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

async function synchronizeEmbeddings() {
  await EmbeddingStorage.synchronize((await ChunkStorage.load()).chunks);
}

async function migrateStudyData(previousStudyId: string, studyId: string) {
  if (previousStudyId === studyId) return;
  const previousStillExists = (await StudyEngine.load()).some((study) => study.studyId === previousStudyId);
  if (previousStillExists) return;

  await NotesService.save((await NotesService.load()).map((note) => note.studyId === previousStudyId ? { ...note, studyId } : note));
  await FlashcardService.save((await FlashcardService.load()).map((card) => card.studyId === previousStudyId ? { ...card, studyId } : card));
  const quiz = await QuizService.load();
  await QuizService.save({
    questions: quiz.questions.map((question) => question.studyId === previousStudyId ? { ...question, studyId } : question),
    results: quiz.results.map((result) => result.studyId === previousStudyId ? { ...result, studyId } : result),
  });
  await SummaryStorage.save(((await SummaryStorage.load()) ?? []).map((summary) =>
    summary.studyId === previousStudyId ? { ...summary, studyId } : summary,
  ));
}

function analysisFromMetadata(metadata: ExtractionMetadata) {
  if (!metadata.analysisStatus || !metadata.analyzedAt) return null;
  return {
    initialSummary: metadata.summaryPreview,
    detectedTitle: metadata.title,
    detectedSubject: metadata.subject,
    detectedTopic: metadata.topic,
    keywords: metadata.keywords,
    language: metadata.language,
    subtopics: metadata.subtopics,
    chapters: metadata.chapters,
    pageCount: metadata.pageCount,
    wordCount: metadata.wordCount,
    readingTimeMinutes: metadata.readingTimeMinutes,
    analysisStatus: metadata.analysisStatus,
    analyzedAt: metadata.analyzedAt,
  };
}

export const OrganizationService = {
  async organizeImported(materialId: string) {
    const material = await MaterialService.findById(materialId);
    if (!material) throw new Error("O material importado não foi encontrado.");

    const destination = inferMaterialDestination(material);
    const matchingStudy = (await MaterialService.load()).find((candidate) =>
      candidate.id !== material.id && candidate.studyId && sameDestination(candidate, destination),
    );
    const studyId = material.studyId && sameDestination(material, destination)
      ? material.studyId
      : matchingStudy?.studyId ?? crypto.randomUUID();
    const updated = await MaterialService.update(material.id, { ...destination, studyId });
    if (!updated) throw new Error("Não foi possível vincular o material ao estudo.");

    await StudyEngine.save(StudyEngine.syncMaterial(await StudyEngine.load(), updated));
    return { ...updated, studyId };
  },

  async rename(materialId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return null;

    const material = await MaterialService.update(materialId, { name: nextName });
    if (!material) return null;
    await ContentStorage.updateFile(material.fileId, { name: nextName });
    await ChunkStorage.updateFile(material.fileId, { sourceName: nextName });
    return material;
  },

  async move(materialId: string, destination: MaterialDestination) {
    const material = await MaterialService.findById(materialId);
    if (!material) return null;

    const completeDestination = Object.fromEntries(
      Object.entries(destination).map(([key, value]) => [key, value.trim()]),
    ) as MaterialDestination;
    if (Object.values(completeDestination).some((value) => !value)) return null;

    const matchingStudy = (await MaterialService.load()).find((candidate) =>
      candidate.id !== material.id && candidate.studyId && sameDestination(candidate, completeDestination),
    );
    const studyId = sameDestination(material, completeDestination) && material.studyId
      ? material.studyId
      : matchingStudy?.studyId ?? crypto.randomUUID();
    const updated = await MaterialService.update(materialId, { ...completeDestination, studyId });
    if (!updated) return null;

    const extractedContent = (await ContentStorage.load()).records.find((record) => record.fileId === material.fileId);
    await ContentStorage.updateFile(material.fileId, { studyId });
    await ChunkStorage.updateFile(material.fileId, { studyId });
    await synchronizeEmbeddings();

    const withoutOldAssociation = StudyEngine.removeMaterial(
      await StudyEngine.load(),
      material.studyId,
      material.id,
    );
    const synchronized = StudyEngine.syncMaterial(withoutOldAssociation, updated);
    const analysis = extractedContent ? analysisFromMetadata(extractedContent.metadata) : null;
    await StudyEngine.save(analysis
      ? StudyEngine.applyAnalysis(synchronized, studyId, analysis, {
          subject: completeDestination.subject,
          topic: completeDestination.topic,
        })
      : synchronized,
    );
    if (material.studyId) await migrateStudyData(material.studyId, studyId);
    return updated;
  },

  async remove(materialId: string) {
    const material = await MaterialService.findById(materialId);
    if (!material) return false;

    await ContentStorage.removeByFileId(material.fileId);
    await ChunkStorage.removeByFileId(material.fileId);
    await synchronizeEmbeddings();
    MaterialRuntimeStore.remove(material.id);
    await MaterialService.remove(material.id);
    await StudyEngine.save(StudyEngine.removeMaterial(await StudyEngine.load(), material.studyId, material.id));
    return true;
  },
};
