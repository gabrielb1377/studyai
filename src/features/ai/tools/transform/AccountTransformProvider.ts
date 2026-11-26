/**
 * StudyAI — Tool Engine (TE-4)
 * Camada de acesso e persistência isolada por conta para leitura documental
 * e transformações com confirmação explícita (`doc_reader`, `flashcards`, `quiz`, `plan`).
 *
 * Garantias:
 * - Identidade deriva exclusivamente de `context.userId` validado contra `SessionOperationManager`.
 * - Toda leitura ou escrita verifica a sessão ANTES e DEPOIS de operações assíncronas.
 * - Qualquer registro sem `ownerId` explícito ou pertencente a outra conta é descartado/recusado.
 * - O Gateway no cliente não substitui autorização real no servidor.
 */

import { SessionChangedError, SessionOperationManager } from "@/features/account/SessionOperationManager";
import { ContentStorage } from "@/features/extraction/ContentStorage";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { FlashcardService } from "@/features/flashcards/FlashcardService";
import { ErrorNotebookStorage } from "@/features/learning/errors/ErrorNotebookStorage";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";
import { LearningStorage } from "@/features/learning/LearningStorage";
import { TopicReviewStorage } from "@/features/learning/TopicReviewStorage";
import type { TopicReview } from "@/features/learning/TopicReview";
import type { LearningProfile } from "@/features/learning/types";
import { PlanningStorage } from "@/features/planning/PlanningStorage";
import type { StudyPlan } from "@/features/planning/types";
import { QuizService } from "@/features/quiz/QuizService";
import { StorageManager } from "@/lib/storage/StorageManager";
import type { Exam } from "@/types/exam";
import type { Flashcard } from "@/types/flashcard";
import type { QuizQuestion, QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import {
  filterOwnedRecords,
  runWithVerifiedAccountSession,
  type OwnedRecord,
} from "../read/AccountReadProvider";

export interface AccountDocumentsDataset {
  readonly contents: readonly OwnedRecord<ExtractedContent>[];
}

export interface AccountFlashcardsDataset {
  readonly studies: readonly OwnedRecord<StudyRecord>[];
  readonly flashcards: readonly OwnedRecord<Flashcard>[];
}

export interface AccountQuizDataset {
  readonly studies: readonly OwnedRecord<StudyRecord>[];
  readonly questions: readonly OwnedRecord<QuizQuestion>[];
  readonly results: readonly OwnedRecord<QuizResult>[];
}

export interface AccountPlanningDataset {
  readonly studies: readonly OwnedRecord<StudyRecord>[];
  readonly profile: OwnedRecord<LearningProfile> | null;
  readonly flashcards: readonly OwnedRecord<Flashcard>[];
  readonly quizzes: readonly OwnedRecord<QuizResult>[];
  readonly topicReviews: readonly OwnedRecord<TopicReview>[];
  readonly exams: readonly OwnedRecord<Exam>[];
  readonly errorEntries: readonly OwnedRecord<ErrorNotebookEntry>[];
  readonly existingPlan: (StudyPlan & { readonly ownerId?: string }) | null;
}

export interface FlashcardsPersistResult {
  readonly persistedIds: readonly string[];
  readonly skippedDuplicates: number;
  readonly totalInStudy: number;
}

export interface QuizPersistResult {
  readonly persistedIds: readonly string[];
  readonly skippedDuplicates: number;
  readonly totalInStudy: number;
}

export interface PlanPersistResult {
  readonly planId: string;
  readonly itemCount: number;
  readonly updatedAt: string;
}

export interface ToolAccountTransformProvider {
  loadDocuments(userId: string, signal: AbortSignal): Promise<AccountDocumentsDataset>;
  loadFlashcardsContext(userId: string, signal: AbortSignal): Promise<AccountFlashcardsDataset>;
  persistFlashcards(
    userId: string,
    studyId: string,
    cards: readonly Flashcard[],
    signal: AbortSignal,
  ): Promise<FlashcardsPersistResult>;
  loadQuizContext(userId: string, signal: AbortSignal): Promise<AccountQuizDataset>;
  persistQuizQuestions(
    userId: string,
    studyId: string,
    questions: readonly QuizQuestion[],
    signal: AbortSignal,
  ): Promise<QuizPersistResult>;
  loadPlanningContext(userId: string, signal: AbortSignal): Promise<AccountPlanningDataset>;
  persistStudyPlan(
    userId: string,
    plan: StudyPlan,
    signal: AbortSignal,
  ): Promise<PlanPersistResult>;
}

export function normalizeDedupeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Garante que o `studyId` (e opcionalmente `materialId`) pertencem comprovadamente à conta ativa.
 */
export function findOwnedStudy(
  studies: readonly OwnedRecord<StudyRecord>[],
  expectedUserId: string,
  studyId: string,
  materialId?: string,
): StudyRecord | null {
  const owned = filterOwnedRecords(studies, expectedUserId);
  const study = owned.find((item) => item.studyId === studyId);
  if (!study) return null;
  if (materialId && !(study.materialIds ?? []).includes(materialId)) {
    return null;
  }
  return study;
}

/**
 * Provedor padrão de produção no cliente (navegador), reutilizando os storages reais
 * isolados por conta (`StorageManager`, `ContentStorage`, `FlashcardService`, `QuizService`,
 * `PlanningStorage`, `LearningStorage`, `ErrorNotebookStorage`, `TopicReviewStorage`).
 *
 * Fora do navegador (SSR/Node), falha de forma segura sem fallback global.
 */
const defaultClientTransformProvider: ToolAccountTransformProvider = {
  async loadDocuments(userId: string): Promise<AccountDocumentsDataset> {
    if (typeof window === "undefined") {
      return { contents: [] };
    }
    const store = await ContentStorage.load();
    return {
      contents: store.records.map((record) => ({ ...record, ownerId: userId })),
    };
  },

  async loadFlashcardsContext(userId: string): Promise<AccountFlashcardsDataset> {
    if (typeof window === "undefined") {
      return { studies: [], flashcards: [] };
    }
    const [studies, flashcards] = await Promise.all([
      StorageManager.getAll<StudyRecord>("studies"),
      FlashcardService.load(),
    ]);
    return {
      studies: studies.map((s) => ({ ...s, ownerId: userId })),
      flashcards: flashcards.map((c) => ({ ...c, ownerId: userId })),
    };
  },

  async persistFlashcards(
    userId: string,
    studyId: string,
    cards: readonly Flashcard[],
  ): Promise<FlashcardsPersistResult> {
    if (typeof window === "undefined") {
      throw new Error("Persistência local de flashcards indisponível fora do navegador.");
    }
    const session = SessionOperationManager.current();
    if (session.suspended || session.userId !== userId) {
      throw new SessionChangedError("Sessão incompatível no momento da gravação de flashcards.");
    }
    const existing = await FlashcardService.load();
    const existingKeys = new Set(
      existing
        .filter((c) => c.studyId === studyId)
        .map((c) => normalizeDedupeKey(c.question)),
    );
    const toInsert: Flashcard[] = [];
    let skippedDuplicates = 0;
    for (const card of cards) {
      const key = normalizeDedupeKey(card.question);
      if (existingKeys.has(key)) {
        skippedDuplicates += 1;
        continue;
      }
      existingKeys.add(key);
      toInsert.push({ ...card, studyId });
    }
    if (toInsert.length > 0) {
      await FlashcardService.save([...existing, ...toInsert]);
    }
    const totalInStudy = existing.filter((c) => c.studyId === studyId).length + toInsert.length;
    return {
      persistedIds: toInsert.map((c) => c.id),
      skippedDuplicates,
      totalInStudy,
    };
  },

  async loadQuizContext(userId: string): Promise<AccountQuizDataset> {
    if (typeof window === "undefined") {
      return { studies: [], questions: [], results: [] };
    }
    const [studies, store] = await Promise.all([
      StorageManager.getAll<StudyRecord>("studies"),
      QuizService.load(),
    ]);
    return {
      studies: studies.map((s) => ({ ...s, ownerId: userId })),
      questions: store.questions.map((q) => ({ ...q, ownerId: userId })),
      results: store.results.map((r) => ({ ...r, ownerId: userId })),
    };
  },

  async persistQuizQuestions(
    userId: string,
    studyId: string,
    questions: readonly QuizQuestion[],
  ): Promise<QuizPersistResult> {
    if (typeof window === "undefined") {
      throw new Error("Persistência local de quiz indisponível fora do navegador.");
    }
    const session = SessionOperationManager.current();
    if (session.suspended || session.userId !== userId) {
      throw new SessionChangedError("Sessão incompatível no momento da gravação do quiz.");
    }
    const store = await QuizService.load();
    const existingKeys = new Set(
      store.questions
        .filter((q) => q.studyId === studyId)
        .map((q) => normalizeDedupeKey(q.question)),
    );
    const toInsert: QuizQuestion[] = [];
    let skippedDuplicates = 0;
    for (const question of questions) {
      const key = normalizeDedupeKey(question.question);
      if (existingKeys.has(key)) {
        skippedDuplicates += 1;
        continue;
      }
      existingKeys.add(key);
      toInsert.push({ ...question, studyId });
    }
    // Preserva store.results intacto (nunca cria tentativa nem altera notas)
    if (toInsert.length > 0) {
      await QuizService.save({
        questions: [...store.questions, ...toInsert],
        results: store.results,
      });
    }
    const totalInStudy = store.questions.filter((q) => q.studyId === studyId).length + toInsert.length;
    return {
      persistedIds: toInsert.map((q) => q.id),
      skippedDuplicates,
      totalInStudy,
    };
  },

  async loadPlanningContext(userId: string): Promise<AccountPlanningDataset> {
    if (typeof window === "undefined") {
      return {
        studies: [],
        profile: null,
        flashcards: [],
        quizzes: [],
        topicReviews: [],
        exams: [],
        errorEntries: [],
        existingPlan: null,
      };
    }
    const [studies, profile, flashcards, quizStore, topicReviews, errorEntries, existingPlan] =
      await Promise.all([
        StorageManager.getAll<StudyRecord>("studies"),
        LearningStorage.load(),
        FlashcardService.load(),
        QuizService.load(),
        TopicReviewStorage.load(),
        ErrorNotebookStorage.load(),
        PlanningStorage.load(),
      ]);
    return {
      studies: studies.map((s) => ({ ...s, ownerId: userId })),
      profile: { ...profile, ownerId: userId },
      flashcards: flashcards.map((c) => ({ ...c, ownerId: userId })),
      quizzes: quizStore.results.map((r) => ({ ...r, ownerId: userId })),
      topicReviews: topicReviews.map((t) => ({ ...t, ownerId: userId })),
      exams: [],
      errorEntries: errorEntries.map((e) => ({ ...e, ownerId: userId })),
      existingPlan: existingPlan ? { ...existingPlan, ownerId: userId } : null,
    };
  },

  async persistStudyPlan(userId: string, plan: StudyPlan): Promise<PlanPersistResult> {
    if (typeof window === "undefined") {
      throw new Error("Persistência local de plano de estudos indisponível fora do navegador.");
    }
    const session = SessionOperationManager.current();
    if (session.suspended || session.userId !== userId) {
      throw new SessionChangedError("Sessão incompatível no momento da gravação do plano.");
    }
    const saved = await PlanningStorage.save(plan);
    return {
      planId: saved.id,
      itemCount: saved.items.length,
      updatedAt: saved.updatedAt,
    };
  },
};

let activeTransformProvider: ToolAccountTransformProvider = defaultClientTransformProvider;

export function getToolAccountTransformProvider(): ToolAccountTransformProvider {
  return activeTransformProvider;
}

export function setToolAccountTransformProviderForTesting(
  provider: ToolAccountTransformProvider | null,
): void {
  activeTransformProvider = provider ?? defaultClientTransformProvider;
}

export { runWithVerifiedAccountSession };
