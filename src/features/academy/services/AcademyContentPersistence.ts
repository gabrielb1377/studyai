import { ContentStorage } from "@/features/extraction/ContentStorage";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { FlashcardService } from "@/features/flashcards/FlashcardService";
import { LearningService } from "@/features/learning/LearningService";
import { MentorService } from "@/features/mentor/services/MentorService";
import { QuizService } from "@/features/quiz/QuizService";
import { ChunkService } from "@/features/retrieval/ChunkService";
import { ChunkStorage } from "@/features/retrieval/ChunkStorage";
import { EmbeddingStorage } from "@/features/retrieval/EmbeddingStorage";
import { KnowledgeService } from "@/features/semantic/KnowledgeService";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { SummaryService } from "@/features/summaries/services/SummaryService";
import { SummaryStorage } from "@/features/summaries/services/SummaryStorage";
import { MaterialService } from "@/services/material-service";
import type { Material, AcademyMaterialKind } from "@/types/material";
import type { StudyChapter } from "@/types/study-engine";
import { AcademyStorage } from "../storage/AcademyStorage";
import type { AcademyContentKind, AcademyGeneratedContent, AcademyModule, AcademyStudy } from "../types";
import { academyContentToMarkdown } from "./AcademyContentFormatter";

function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function chaptersForStudy(content: AcademyGeneratedContent): StudyChapter[] {
  return content.chapters.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    marker: "chapter",
    order: index,
  }));
}

function connectModules(modules: readonly AcademyModule[], content: AcademyGeneratedContent) {
  return modules.map((module, moduleIndex) => ({
    ...module,
    chapterIds: content.chapters
      .filter((_, chapterIndex) => chapterIndex % Math.max(modules.length, 1) === moduleIndex)
      .map((chapter) => chapter.id),
  }));
}

function materialKind(kind: AcademyContentKind): AcademyMaterialKind {
  if (kind === "learning-path") return "learning-path";
  if (kind === "practical-project") return "practical-project";
  return "free-study";
}

function makeMaterial(study: AcademyStudy, content: AcademyGeneratedContent, options: {
  id: string;
  name: string;
  kind: AcademyMaterialKind;
  size: number;
  now: string;
}): Material {
  return {
    id: options.id,
    fileId: options.id,
    identity: `academy:${study.id}:${content.id}:${options.kind}`,
    name: options.name,
    relativePath: `Academy/${study.subject}/${study.topic}/${options.name}`,
    fileType: "txt",
    mimeType: "application/x-studyai-academy",
    size: options.size,
    lastModified: Date.now(),
    importedAt: options.now,
    updatedAt: options.now,
    progress: study.progress,
    status: "ready",
    isFavorite: false,
    studyId: study.id,
    subject: study.subject,
    topic: study.topic,
    persistentBinary: false,
    sourceType: "ai-generated",
    academyStudyId: study.id,
    academyContentId: content.id,
    academyMaterialKind: options.kind,
    tags: ["Academy", "Material Gerado por IA"],
  };
}

function nextReview() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export const AcademyContentPersistence = {
  async persist(
    study: AcademyStudy,
    generated: AcademyGeneratedContent,
    options: { onPhase?: (phase: "library" | "learning") => void } = {},
  ) {
    const now = new Date().toISOString();
    const markdown = academyContentToMarkdown(generated);
    const byteSize = new TextEncoder().encode(markdown).byteLength;
    const wordCount = words(markdown);
    const mainMaterialId = `academy-material-${generated.id}`;
    const summaryMaterialId = `academy-summary-${generated.id}`;
    const exerciseMaterialId = `academy-exercises-${generated.id}`;
    const modules = connectModules(generated.modules, generated);
    const content: AcademyGeneratedContent = { ...generated, modules };
    const updatedStudy: AcademyStudy = {
      ...study,
      title: content.title,
      modules,
      contents: [content, ...study.contents.filter((item) => item.id !== content.id)],
      status: "ready",
      updatedAt: now,
      generationError: undefined,
    };
    const extracted: ExtractedContent = {
      id: `extracted-${generated.id}`,
      studyId: study.id,
      fileId: mainMaterialId,
      fileType: "txt",
      extractedText: markdown,
      sections: content.chapters.flatMap((chapter) => [
        { type: "heading" as const, text: chapter.title, level: 1 },
        { type: "paragraph" as const, text: chapter.content },
        ...chapter.examples.map((example) => ({ type: "paragraph" as const, text: `Exemplo: ${example}` })),
      ]),
      metadata: {
        name: `${content.title}.txt`,
        type: "application/x-studyai-academy",
        size: byteSize,
        title: content.title,
        subject: study.subject,
        topic: study.topic,
        subtopics: modules.map((module) => module.title),
        keywords: content.concepts.map((concept) => concept.name),
        summaryPreview: content.summary.slice(0, 500),
        language: study.language,
        wordCount,
        readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 220)),
        chapters: chaptersForStudy(content),
        analysisStatus: "analyzed",
        analyzedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      stages: ["document", "extraction", "analysis", "study", "semantic", "chunks", "embeddings", "indexed"].map((stage) => ({
        id: stage as ExtractedContent["stages"] extends Array<infer T> ? T extends { id: infer I } ? I : never : never,
        status: "completed" as const,
        completedAt: now,
      })),
      logs: [{ id: `academy-log-${generated.id}`, stage: "extraction", status: "completed", message: "Conteúdo Academy estruturado e indexado.", createdAt: now }],
      status: "extracted",
      createdAt: now,
    };

    const mainMaterial = makeMaterial(study, content, { id: mainMaterialId, name: content.title, kind: materialKind(content.kind), size: byteSize, now });
    const summaryMaterial = makeMaterial(study, content, { id: summaryMaterialId, name: `Resumo — ${content.title}`, kind: "summary", size: new TextEncoder().encode(content.summary).byteLength, now });
    const exerciseText = content.exercises.map((exercise) => `${exercise.question}\n${exercise.answer}`).join("\n\n");
    const exerciseMaterial = makeMaterial(study, content, { id: exerciseMaterialId, name: `Exercícios — ${content.title}`, kind: "exercise", size: new TextEncoder().encode(exerciseText).byteLength, now });

    options.onPhase?.("library");
    await Promise.all([MaterialService.upsert(mainMaterial), MaterialService.upsert(summaryMaterial), MaterialService.upsert(exerciseMaterial)]);
    await ContentStorage.upsert(extracted);
    const chunks = ChunkService.createChunks(extracted);
    await ChunkStorage.replaceForContent(extracted.id, chunks);
    await EmbeddingStorage.synchronize((await ChunkStorage.load()).chunks);
    options.onPhase?.("learning");
    const knowledge = await KnowledgeService.process(extracted);

    const summaries = await SummaryStorage.load() ?? [];
    const summary = SummaryService.create({ conversationId: `academy:${content.id}`, conversationTitle: content.title, content: content.summary, studyId: study.id, now });
    await SummaryStorage.save(SummaryService.save(summaries, summary, now));
    const flashcards = await FlashcardService.load();
    await FlashcardService.save([...FlashcardService.create(study.id, content.flashcards, now), ...flashcards]);
    const quiz = await QuizService.load();
    await QuizService.save({ ...quiz, questions: [...QuizService.createQuestions(study.id, content.quiz, now), ...quiz.questions] });

    const studies = await StudyEngine.load();
    const studyRecord = studies.find((item) => item.studyId === study.id);
    if (studyRecord) {
      await StudyEngine.save(studies.map((item) => item.studyId === study.id ? {
        ...item,
        title: study.topic,
        subject: study.subject,
        materialIds: Array.from(new Set([...item.materialIds, mainMaterialId, summaryMaterialId, exerciseMaterialId])),
        initialSummary: content.summary,
        detectedTitle: content.title,
        detectedSubject: study.subject,
        detectedTopic: study.topic,
        keywords: content.concepts.map((concept) => concept.name),
        language: study.language,
        subtopics: modules.map((module) => module.title),
        chapters: chaptersForStudy(content),
        wordCount,
        readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 220)),
        analysisStatus: "analyzed" as const,
        analyzedAt: now,
        lastAccessedAt: now,
        updatedAt: now,
      } : item));
    }
    await LearningService.registerStudy({
      studyId: study.id,
      subject: study.subject,
      topic: study.topic,
      goal: study.goal,
      estimatedMinutes: study.duration,
      progress: study.progress,
      difficulty: study.level === "quick-review" ? "basic" : study.level,
      knowledgeEstimate: 0,
      nextReviewAt: nextReview(),
      recommendedActivities: ["Ler o primeiro capítulo", "Revisar os flashcards", "Responder ao quiz"],
      createdAt: now,
    });
    await AcademyStorage.put(updatedStudy);
    const recommendations = await MentorService.refreshRecommendations(study.id);
    return { study: updatedStudy, content, materials: [mainMaterial, summaryMaterial, exerciseMaterial], knowledge: knowledge.graph, recommendations };
  },
};
