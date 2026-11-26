/**
 * StudyAI — Tool Engine (TE-4)
 * Ferramenta canônica de preparação e persistência confirmada de flashcards (`flashcards@0.1.0`).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §3–§5:
 * - Classe oficial: `transform` (`mode: "prepare"` puro, zero escrita).
 * - Persistência (`mode: "commit"`) exige permissão confiável `"write"` e proposta
 *   previamente preparada, pré-visualizada e confirmada via `ToolConfirmationService`.
 * - Reutiliza `FlashcardService.create` e persistência isolada por conta.
 */

import { FlashcardService } from "@/features/flashcards/FlashcardService";
import type { Flashcard, FlashcardDifficulty } from "@/types/flashcard";
import { filterOwnedRecords } from "../read/AccountReadProvider";
import {
  PreconditionFailedError,
  type ToolConfirmationService,
  type ToolProposalRecord,
} from "../ToolConfirmationService";
import type { ToolExecutorFn, ToolSpec } from "../types";
import {
  findOwnedStudy,
  getToolAccountTransformProvider,
  normalizeDedupeKey,
  runWithVerifiedAccountSession,
} from "./AccountTransformProvider";

export const FLASHCARDS_MAX_BATCH_ITEMS = 8;

export interface FlashcardProposalItem {
  readonly question: string;
  readonly answer: string;
  readonly difficulty: FlashcardDifficulty;
}

export interface FlashcardsToolOutput {
  readonly mode: "prepare" | "commit";
  readonly status: "proposal_ready" | "committed" | "no_valid_items" | "unauthorized_reference";
  readonly requiresConfirmation: boolean;
  readonly mutatedState: boolean;
  readonly studyId?: string;
  readonly destination?: string;
  readonly proposalId?: string;
  readonly previewHash?: string;
  readonly expiresAt?: string;
  readonly acceptedCount: number;
  readonly rejectedDuplicateCount: number;
  readonly persistedCount: number;
  readonly previewItems: readonly FlashcardProposalItem[];
  readonly savedIds: readonly string[];
  readonly notice?: string;
}

interface FlashcardsProposalPayload extends Record<string, unknown> {
  readonly studyId: string;
  readonly materialId?: string;
  readonly cards: readonly Flashcard[];
}

export const flashcardsToolSpec: ToolSpec = {
  id: "flashcards",
  version: "0.1.0",
  class: "transform",
  description:
    "Prepara propostas validadas de flashcards para pré-visualização (sem escrita) e persiste exclusivamente mediante confirmação explícita do usuário.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["mode"],
    properties: {
      mode: { type: "string", enum: ["prepare", "commit"] },
      studyId: { type: "string", minLength: 1, maxLength: 128 },
      materialId: { type: "string", minLength: 1, maxLength: 128 },
      items: {
        type: "array",
        maxItems: FLASHCARDS_MAX_BATCH_ITEMS,
        items: {
          type: "object",
          required: ["question", "answer"],
          properties: {
            question: { type: "string", minLength: 3, maxLength: 300 },
            answer: { type: "string", minLength: 1, maxLength: 800 },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          },
        },
      },
      proposalId: { type: "string", minLength: 1, maxLength: 128 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "mode",
      "status",
      "requiresConfirmation",
      "mutatedState",
      "acceptedCount",
      "rejectedDuplicateCount",
      "persistedCount",
      "previewItems",
      "savedIds",
    ],
    properties: {
      mode: { type: "string", enum: ["prepare", "commit"] },
      status: {
        type: "string",
        enum: ["proposal_ready", "committed", "no_valid_items", "unauthorized_reference"],
      },
      requiresConfirmation: { type: "boolean" },
      mutatedState: { type: "boolean" },
      studyId: { type: "string", maxLength: 128 },
      destination: { type: "string", maxLength: 180 },
      proposalId: { type: "string", maxLength: 128 },
      previewHash: { type: "string", maxLength: 64 },
      expiresAt: { type: "string", maxLength: 40 },
      acceptedCount: { type: "number", min: 0, max: FLASHCARDS_MAX_BATCH_ITEMS },
      rejectedDuplicateCount: { type: "number", min: 0, max: FLASHCARDS_MAX_BATCH_ITEMS },
      persistedCount: { type: "number", min: 0, max: FLASHCARDS_MAX_BATCH_ITEMS },
      previewItems: {
        type: "array",
        maxItems: FLASHCARDS_MAX_BATCH_ITEMS,
        items: {
          type: "object",
          required: ["question", "answer", "difficulty"],
          properties: {
            question: { type: "string", maxLength: 300 },
            answer: { type: "string", maxLength: 800 },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          },
        },
      },
      savedIds: {
        type: "array",
        maxItems: FLASHCARDS_MAX_BATCH_ITEMS,
        items: { type: "string", maxLength: 128 },
      },
      notice: { type: "string", maxLength: 320 },
    },
  },
  scope: {
    requiredScopes: ["account", "study"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 3000,
    maxInputBytes: 12288,
    maxOutputBytes: 14336,
    maxItems: FLASHCARDS_MAX_BATCH_ITEMS,
    maxDepth: 6,
    maxCallsPerTurn: 3,
  },
  requiresConfirmation: false,
  audit: {
    recordDuration: true,
    includeStudentContent: false,
    allowedMetadataFields: ["toolId", "toolVersion", "toolClass", "status", "denialReason", "durationMs"],
  },
  tests: {
    deterministicFixtures: true,
    description: "Valida preparação sem escrita, deduplicação, confirmação SHA-256 e isolamento A->B.",
  },
  available: true,
};

export const executeFlashcardsTool: ToolExecutorFn = async (args, context) => {
  const mode = args.mode === "commit" ? "commit" : "prepare";
  const confirmationService = context.confirmationService as ToolConfirmationService | undefined;

  if (mode === "commit") {
    const approved = context.approvedProposal as unknown as
      | ToolProposalRecord<Record<string, unknown>, FlashcardsProposalPayload>
      | undefined;
    if (!approved || approved.toolId !== "flashcards") {
      throw new PreconditionFailedError("Proposta confirmada ausente para persistência de flashcards.");
    }

    const payload = approved.payload;
    return runWithVerifiedAccountSession(context.userId, async (operation) => {
      const provider = getToolAccountTransformProvider();
      const dataset = await provider.loadFlashcardsContext(context.userId, operation.signal);
      operation.assertCurrent();

      const ownedStudy = findOwnedStudy(
        dataset.studies,
        context.userId,
        payload.studyId,
        payload.materialId,
      );
      if (!ownedStudy) {
        throw new PreconditionFailedError(
          "O estudo ou material de destino não pertence mais à conta ativa.",
        );
      }

      const persisted = await provider.persistFlashcards(
        context.userId,
        payload.studyId,
        payload.cards,
        operation.signal,
      );
      operation.assertCurrent();

      return {
        mode: "commit",
        status: "committed",
        requiresConfirmation: true,
        mutatedState: persisted.persistedIds.length > 0,
        studyId: payload.studyId,
        destination: approved.destination,
        proposalId: approved.proposalId,
        previewHash: approved.previewHash,
        acceptedCount: payload.cards.length,
        rejectedDuplicateCount: persisted.skippedDuplicates,
        persistedCount: persisted.persistedIds.length,
        previewItems: payload.cards.map((c) => ({
          question: c.question,
          answer: c.answer,
          difficulty: c.difficulty,
        })),
        savedIds: [...persisted.persistedIds],
      } satisfies FlashcardsToolOutput as unknown as Record<string, unknown>;
    });
  }

  // Modo `prepare`: transformação pura + criação de proposta imutável (ZERO escrita persistente)
  const studyId = typeof args.studyId === "string" ? args.studyId.trim() : "";
  const materialId = typeof args.materialId === "string" ? args.materialId.trim() : undefined;
  const rawItems = Array.isArray(args.items) ? args.items : [];

  if (!studyId || rawItems.length === 0) {
    throw new Error("Modo prepare de flashcards exige studyId e ao menos um item válido.");
  }
  if (!confirmationService) {
    throw new Error("Serviço de confirmação indisponível para registrar proposta de flashcards.");
  }

  return runWithVerifiedAccountSession(context.userId, async (operation) => {
    const provider = getToolAccountTransformProvider();
    const dataset = await provider.loadFlashcardsContext(context.userId, operation.signal);
    operation.assertCurrent();

    const ownedStudy = findOwnedStudy(dataset.studies, context.userId, studyId, materialId);
    if (!ownedStudy) {
      return {
        mode: "prepare",
        status: "unauthorized_reference",
        requiresConfirmation: true,
        mutatedState: false,
        acceptedCount: 0,
        rejectedDuplicateCount: 0,
        persistedCount: 0,
        previewItems: [],
        savedIds: [],
        notice: "Estudo ou material de referência não encontrado na conta ativa.",
      } satisfies FlashcardsToolOutput as unknown as Record<string, unknown>;
    }

    const existingOwnedCards = filterOwnedRecords(dataset.flashcards, context.userId).filter(
      (c) => c.studyId === studyId,
    );
    const seenKeys = new Set(existingOwnedCards.map((c) => normalizeDedupeKey(c.question)));

    const validItems: FlashcardProposalItem[] = [];
    let rejectedDuplicateCount = 0;

    for (const raw of rawItems.slice(0, FLASHCARDS_MAX_BATCH_ITEMS)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const question = typeof item.question === "string" ? item.question.trim() : "";
      const answer = typeof item.answer === "string" ? item.answer.trim() : "";
      const difficulty: FlashcardDifficulty =
        item.difficulty === "easy" || item.difficulty === "hard" ? item.difficulty : "medium";
      if (question.length < 3 || answer.length < 1) continue;

      const key = normalizeDedupeKey(question);
      if (seenKeys.has(key)) {
        rejectedDuplicateCount += 1;
        continue;
      }
      seenKeys.add(key);
      validItems.push({ question, answer, difficulty });
    }

    if (validItems.length === 0) {
      return {
        mode: "prepare",
        status: "no_valid_items",
        requiresConfirmation: true,
        mutatedState: false,
        studyId,
        acceptedCount: 0,
        rejectedDuplicateCount,
        persistedCount: 0,
        previewItems: [],
        savedIds: [],
        notice: "Nenhum flashcard novo disponível após validação e remoção de duplicatas.",
      } satisfies FlashcardsToolOutput as unknown as Record<string, unknown>;
    }

    const createdCards = FlashcardService.create(studyId, validItems);
    const destination = `flashcards:${studyId}`;
    const proposal = confirmationService.createProposal({
      toolId: "flashcards",
      toolVersion: flashcardsToolSpec.version,
      userId: context.userId,
      sessionId: context.sessionId,
      turnId: context.turnId,
      destination,
      canonicalArgs: args,
      preview: {
        studyId,
        ...(materialId ? { materialId } : {}),
        items: validItems,
      },
      payload: {
        studyId,
        ...(materialId ? { materialId } : {}),
        cards: createdCards,
      } satisfies FlashcardsProposalPayload,
    });

    return {
      mode: "prepare",
      status: "proposal_ready",
      requiresConfirmation: true,
      mutatedState: false,
      studyId,
      destination,
      proposalId: proposal.proposalId,
      previewHash: proposal.previewHash,
      expiresAt: proposal.expiresAt,
      acceptedCount: validItems.length,
      rejectedDuplicateCount,
      persistedCount: 0,
      previewItems: validItems,
      savedIds: [],
      notice: "Pré-visualização pronta. Nenhuma alteração foi salva até confirmação explícita.",
    } satisfies FlashcardsToolOutput as unknown as Record<string, unknown>;
  });
};
