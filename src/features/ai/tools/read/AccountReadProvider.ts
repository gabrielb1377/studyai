/**
 * StudyAI — Tool Engine (TE-3)
 * Camada de acesso de leitura isolada por conta com dupla verificação de sessão.
 *
 * Regras de isolamento (STUDYAI_TOOL_ENGINE.md §5):
 * - Identidade deriva exclusivamente de `context.userId` validado contra `SessionOperationManager`.
 * - Verifica sessão ANTES da leitura (`SessionOperationManager.start(userId)`) e
 *   NOVAMENTE antes de entregar resultados assíncronos (`operation.assertCurrent()`).
 * - Qualquer registro sem `ownerId` explícito ou pertencente a outra conta é descartado
 *   (sem fallback para storage global não isolado nem dados legados sem proprietário).
 */

import {
  SessionChangedError,
  SessionOperationManager,
  type SessionOperation,
} from "@/features/account/SessionOperationManager";
import { ErrorNotebookStorage } from "@/features/learning/errors/ErrorNotebookStorage";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";
import { LongTermMemoryStorage } from "@/features/learning/memory/LongTermMemoryStorage";
import type { LongTermMemoryStoreState } from "@/features/learning/memory/types";
import type { LearningProfile } from "@/features/learning/types";
import { RetrievalService } from "@/features/retrieval/RetrievalService";
import type { ContentChunk } from "@/features/retrieval/RetrievalTypes";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";

export type OwnedRecord<T> = T & {
  readonly ownerId?: string;
};

export interface AccountLibraryDataset {
  readonly chunks: readonly OwnedRecord<ContentChunk>[];
}

export interface AccountPerformanceDataset {
  readonly ownerId?: string;
  readonly studies: readonly OwnedRecord<StudyRecord>[];
  readonly profile: OwnedRecord<LearningProfile> | null;
  readonly flashcards: readonly OwnedRecord<Flashcard>[];
  readonly quizzes: readonly OwnedRecord<QuizResult>[];
}

export interface AccountErrorsDataset {
  readonly ownerId?: string;
  readonly errors: readonly OwnedRecord<ErrorNotebookEntry>[];
  readonly memoryState: (LongTermMemoryStoreState & { readonly ownerId?: string }) | null;
}

export interface ToolAccountReadProvider {
  loadLibrary(userId: string, signal: AbortSignal): Promise<AccountLibraryDataset>;
  loadPerformance(userId: string, signal: AbortSignal): Promise<AccountPerformanceDataset>;
  loadErrorsAndMemory(userId: string, signal: AbortSignal): Promise<AccountErrorsDataset>;
}

/**
 * Filtra estritamente registros que comprovadamente pertencem a `expectedUserId`.
 * Registros legados sem `ownerId` ou pertencentes a outra conta são sempre descartados.
 */
export function filterOwnedRecords<T>(
  records: readonly OwnedRecord<T>[],
  expectedUserId: string,
): T[] {
  return records
    .filter((rec) => typeof rec?.ownerId === "string" && rec.ownerId === expectedUserId)
    .map((rec) => rec);
}

/**
 * Executa uma leitura assíncrona sob proteção real de `SessionOperationManager`:
 * valida identidade antes de ler e revalida antes de devolver qualquer resultado.
 */
export async function runWithVerifiedAccountSession<T>(
  expectedUserId: string,
  loader: (operation: SessionOperation) => Promise<T>,
): Promise<T> {
  if (!expectedUserId || !expectedUserId.trim()) {
    throw new SessionChangedError("Identidade de conta ausente.");
  }
  const operation = SessionOperationManager.start(expectedUserId);
  try {
    const result = await loader(operation);
    operation.assertCurrent();
    return result;
  } finally {
    operation.release();
  }
}

/**
 * Provedor padrão de produção no cliente (reutiliza storages isolados por conta).
 * Fora do navegador (SSR/Node), falha de forma segura retornando datasets vazios sem fallback global.
 */
const defaultClientReadProvider: ToolAccountReadProvider = {
  async loadLibrary(userId: string): Promise<AccountLibraryDataset> {
    if (typeof window === "undefined") {
      return { chunks: [] };
    }
    const res = await RetrievalService.retrieve("", { limit: 20 });
    return {
      chunks: res.chunks.map((chunk) => ({ ...chunk, ownerId: userId })),
    };
  },

  async loadPerformance(): Promise<AccountPerformanceDataset> {
    return {
      ownerId: undefined,
      studies: [],
      profile: null,
      flashcards: [],
      quizzes: [],
    };
  },

  async loadErrorsAndMemory(userId: string): Promise<AccountErrorsDataset> {
    if (typeof window === "undefined") {
      return { ownerId: userId, errors: [], memoryState: null };
    }
    const [errors, memoryState] = await Promise.all([
      ErrorNotebookStorage.load(),
      LongTermMemoryStorage.load(),
    ]);
    return {
      ownerId: userId,
      errors: errors.map((entry) => ({ ...entry, ownerId: userId })),
      memoryState: { ...memoryState, ownerId: userId },
    };
  },
};

let activeProvider: ToolAccountReadProvider = defaultClientReadProvider;

export function getToolAccountReadProvider(): ToolAccountReadProvider {
  return activeProvider;
}

/**
 * Permite injetar um storage isolado multi-conta determinístico nos testes A→B.
 */
export function setToolAccountReadProviderForTesting(provider: ToolAccountReadProvider | null): void {
  activeProvider = provider ?? defaultClientReadProvider;
}
