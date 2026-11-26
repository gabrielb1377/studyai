/**
 * StudyAI — Tool Engine (TE-4)
 * Serviço autoritativo de preparação, pré-visualização e confirmação explícita de escrita.
 *
 * Separa rigidamente as 6 etapas (STUDYAI_TOOL_ENGINE.md §5 e contrato TE-4):
 * 1. Preparação da proposta (imutável, sem efeitos colaterais).
 * 2. Pré-visualização (acesso restrito à sessão proprietária).
 * 3. Confirmação explícita pelo usuário (vinculada ao previewHash SHA-256).
 * 4. Validação e claim síncrono atômico (uso único, anti-replay, anti-corrida).
 * 5. Execução autorizada (via ToolGateway com contexto confiável e sessão verificada).
 * 6. Finalização (executed/failed) e auditoria sanitizada.
 */

import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import type { SkillToolName } from "@/features/ai/skills/types";
import { canonicalJson, deepFreezeClone, sha256Hex } from "./ToolCrypto";
import { computeArgsFingerprint } from "./ToolSchemaValidator";
import type { ToolDenialReason, ToolWriteConfirmation } from "./types";

export const DEFAULT_CONFIRMATION_TTL_MS = 5 * 60 * 1000;
export const MAX_PENDING_PROPOSALS = 256;

export class PreconditionFailedError extends Error {
  constructor(message = "Pré-condição da operação confirmada não foi satisfeita no momento da execução.") {
    super(message);
    this.name = "PreconditionFailedError";
  }
}

export type ToolProposalStatus =
  | "pending"
  | "confirmed"
  | "executing"
  | "executed"
  | "cancelled"
  | "failed";

export interface ToolProposalRecord<
  TPreview extends Record<string, unknown> = Record<string, unknown>,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly proposalId: string;
  readonly toolId: SkillToolName;
  readonly toolVersion: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly sessionGeneration: number;
  readonly turnId: string;
  readonly destination: string;
  readonly canonicalArgs: Readonly<Record<string, unknown>>;
  readonly preview: Readonly<TPreview>;
  readonly payload: Readonly<TPayload>;
  readonly previewHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly previewShown: boolean;
  readonly status: ToolProposalStatus;
  readonly confirmationId?: string;
}

interface MutableProposalEntry {
  readonly proposalId: string;
  readonly toolId: SkillToolName;
  readonly toolVersion: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly sessionGeneration: number;
  readonly turnId: string;
  readonly destination: string;
  readonly canonicalArgs: Readonly<Record<string, unknown>>;
  readonly preview: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly previewHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly expiresAtMs: number;
  previewShown: boolean;
  status: ToolProposalStatus;
  confirmationId?: string;
}

export type ProposalClaimResult =
  | {
      readonly ok: true;
      readonly proposal: ToolProposalRecord;
      readonly finalize: (outcome: "executed" | "failed") => void;
    }
  | {
      readonly ok: false;
      readonly reason: ToolDenialReason;
      readonly message: string;
    };

export type ConfirmProposalResult =
  | { readonly ok: true; readonly confirmation: ToolWriteConfirmation }
  | { readonly ok: false; readonly reason: ToolDenialReason; readonly message: string };

let proposalSeq = 0;
let confirmationSeq = 0;

function nextId(prefix: string, seq: number): string {
  const entropy =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now()}-${seq}-${entropy}`;
}

export function computeProposalIntegrityHash(input: {
  readonly toolId: SkillToolName;
  readonly toolVersion: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly sessionGeneration: number;
  readonly turnId: string;
  readonly destination: string;
  readonly canonicalArgs: Readonly<Record<string, unknown>>;
  readonly preview: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>>;
}): string {
  return sha256Hex(
    canonicalJson({
      toolId: input.toolId,
      toolVersion: input.toolVersion,
      userId: input.userId,
      sessionId: input.sessionId,
      sessionGeneration: input.sessionGeneration,
      turnId: input.turnId,
      destination: input.destination,
      canonicalArgs: input.canonicalArgs,
      preview: input.preview,
      payload: input.payload,
    }),
  );
}

export class ToolConfirmationService {
  private readonly proposals = new Map<string, MutableProposalEntry>();
  private readonly clockNowMs: () => number;

  constructor(options: { readonly nowMs?: () => number } = {}) {
    this.clockNowMs = options.nowMs ?? (() => Date.now());
  }

  private snapshot(entry: MutableProposalEntry): ToolProposalRecord {
    return Object.freeze({
      proposalId: entry.proposalId,
      toolId: entry.toolId,
      toolVersion: entry.toolVersion,
      userId: entry.userId,
      sessionId: entry.sessionId,
      sessionGeneration: entry.sessionGeneration,
      turnId: entry.turnId,
      destination: entry.destination,
      canonicalArgs: entry.canonicalArgs,
      preview: entry.preview,
      payload: entry.payload,
      previewHash: entry.previewHash,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      previewShown: entry.previewShown,
      status: entry.status,
      confirmationId: entry.confirmationId,
    });
  }

  private evictIfFull(nowMs: number): void {
    if (this.proposals.size < MAX_PENDING_PROPOSALS) return;
    for (const [id, entry] of this.proposals.entries()) {
      if (
        entry.status === "executed" ||
        entry.status === "cancelled" ||
        entry.status === "failed" ||
        nowMs > entry.expiresAtMs
      ) {
        this.proposals.delete(id);
        if (this.proposals.size < MAX_PENDING_PROPOSALS) return;
      }
    }
    const oldestKey = this.proposals.keys().next().value;
    if (oldestKey) {
      this.proposals.delete(oldestKey);
    }
  }

  /**
   * Etapa 1 — Registra uma proposta imutável preparada pela ferramenta (zero escrita persistente).
   */
  createProposal<
    TPreview extends Record<string, unknown>,
    TPayload extends Record<string, unknown>,
  >(params: {
    readonly toolId: SkillToolName;
    readonly toolVersion: string;
    readonly userId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly destination: string;
    readonly canonicalArgs: Readonly<Record<string, unknown>>;
    readonly preview: TPreview;
    readonly payload: TPayload;
    readonly ttlMs?: number;
    readonly nowMs?: number;
  }): ToolProposalRecord<TPreview, TPayload> {
    const session = SessionOperationManager.current();
    if (session.suspended || !session.userId || session.userId !== params.userId) {
      throw new Error("Sessão ativa incompatível ao registrar proposta de confirmação.");
    }

    const nowMs = params.nowMs ?? this.clockNowMs();
    this.evictIfFull(nowMs);

    const ttlMs = Math.max(1_000, Math.min(params.ttlMs ?? DEFAULT_CONFIRMATION_TTL_MS, 15 * 60 * 1000));
    const expiresAtMs = nowMs + ttlMs;
    const frozenArgs = deepFreezeClone(params.canonicalArgs);
    const frozenPreview = deepFreezeClone(params.preview);
    const frozenPayload = deepFreezeClone(params.payload);

    proposalSeq += 1;
    const proposalId = nextId("prop", proposalSeq);
    const previewHash = computeProposalIntegrityHash({
      toolId: params.toolId,
      toolVersion: params.toolVersion,
      userId: params.userId,
      sessionId: params.sessionId,
      sessionGeneration: session.generation,
      turnId: params.turnId,
      destination: params.destination,
      canonicalArgs: frozenArgs,
      preview: frozenPreview,
      payload: frozenPayload,
    });

    const entry: MutableProposalEntry = {
      proposalId,
      toolId: params.toolId,
      toolVersion: params.toolVersion,
      userId: params.userId,
      sessionId: params.sessionId,
      sessionGeneration: session.generation,
      turnId: params.turnId,
      destination: params.destination,
      canonicalArgs: frozenArgs,
      preview: frozenPreview,
      payload: frozenPayload,
      previewHash,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      previewShown: false,
      status: "pending",
    };

    this.proposals.set(proposalId, entry);
    return this.snapshot(entry) as ToolProposalRecord<TPreview, TPayload>;
  }

  /**
   * Etapa 2 — Recupera a pré-visualização imutável somente para a sessão ativa proprietária.
   */
  getPreview(
    proposalId: string,
    identity: { readonly userId: string; readonly sessionId: string; readonly nowMs?: number },
  ): ToolProposalRecord | null {
    const entry = this.proposals.get(proposalId);
    if (!entry) return null;
    const session = SessionOperationManager.current();
    const nowMs = identity.nowMs ?? this.clockNowMs();
    if (
      session.suspended ||
      session.userId !== identity.userId ||
      session.generation !== entry.sessionGeneration ||
      entry.userId !== identity.userId ||
      entry.sessionId !== identity.sessionId ||
      entry.status === "cancelled" ||
      nowMs > entry.expiresAtMs
    ) {
      return null;
    }
    return this.snapshot(entry);
  }

  /**
   * Marca explicitamente que a pré-visualização foi apresentada ao usuário na sessão ativa.
   */
  markPreviewShown(
    proposalId: string,
    identity: { readonly userId: string; readonly sessionId: string; readonly nowMs?: number },
  ): boolean {
    const entry = this.proposals.get(proposalId);
    if (!entry) return false;
    const session = SessionOperationManager.current();
    const nowMs = identity.nowMs ?? this.clockNowMs();
    if (
      session.suspended ||
      session.userId !== identity.userId ||
      session.generation !== entry.sessionGeneration ||
      entry.userId !== identity.userId ||
      entry.sessionId !== identity.sessionId ||
      entry.status !== "pending" ||
      nowMs > entry.expiresAtMs
    ) {
      return false;
    }
    entry.previewShown = true;
    return true;
  }

  /**
   * Etapa 3 — Confirmação explícita do usuário vinculada a identidade, sessão, turno,
   * ferramenta/versão, argumentos canônicos, previewHash SHA-256 e destino.
   */
  confirmProposal(params: {
    readonly proposalId: string;
    readonly userId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly previewHash: string;
    readonly nowMs?: number;
  }): ConfirmProposalResult {
    const entry = this.proposals.get(params.proposalId);
    if (!entry) {
      return {
        ok: false,
        reason: "confirmation_invalid",
        message: "Proposta inexistente ou já descartada.",
      };
    }

    const session = SessionOperationManager.current();
    if (
      session.suspended ||
      !session.userId ||
      session.userId !== params.userId ||
      session.userId !== entry.userId ||
      session.generation !== entry.sessionGeneration
    ) {
      return {
        ok: false,
        reason: "session_changed",
        message: "Sessão alterada ou incompatível com a proposta preparada.",
      };
    }

    if (entry.status === "cancelled") {
      return {
        ok: false,
        reason: "confirmation_cancelled",
        message: "Proposta cancelada não pode ser confirmada.",
      };
    }

    if (entry.status !== "pending") {
      return {
        ok: false,
        reason: "confirmation_replayed",
        message: "Proposta já confirmada ou consumida anteriormente.",
      };
    }

    const nowMs = params.nowMs ?? this.clockNowMs();
    if (nowMs > entry.expiresAtMs) {
      return {
        ok: false,
        reason: "confirmation_expired",
        message: "Proposta expirada antes da confirmação explícita.",
      };
    }

    if (entry.sessionId !== params.sessionId || entry.turnId !== params.turnId) {
      return {
        ok: false,
        reason: "confirmation_invalid",
        message: "Confirmação incompatível com a sessão ou turno da proposta.",
      };
    }

    if (!entry.previewShown) {
      return {
        ok: false,
        reason: "confirmation_invalid",
        message: "A pré-visualização precisa ser exibida ao usuário antes da confirmação.",
      };
    }

    const expectedHash = computeProposalIntegrityHash({
      toolId: entry.toolId,
      toolVersion: entry.toolVersion,
      userId: entry.userId,
      sessionId: entry.sessionId,
      sessionGeneration: entry.sessionGeneration,
      turnId: entry.turnId,
      destination: entry.destination,
      canonicalArgs: entry.canonicalArgs,
      preview: entry.preview,
      payload: entry.payload,
    });

    if (params.previewHash !== entry.previewHash || expectedHash !== entry.previewHash) {
      return {
        ok: false,
        reason: "confirmation_invalid",
        message: "Integridade da pré-visualização divergente; confirmação recusada.",
      };
    }

    confirmationSeq += 1;
    const confirmationId = nextId("conf", confirmationSeq);
    entry.status = "confirmed";
    entry.confirmationId = confirmationId;

    const commitArgs = { mode: "commit", proposalId: entry.proposalId };
    const confirmation: ToolWriteConfirmation = Object.freeze({
      confirmationId,
      proposalId: entry.proposalId,
      userId: entry.userId,
      sessionId: entry.sessionId,
      sessionGeneration: entry.sessionGeneration,
      turnId: entry.turnId,
      toolId: entry.toolId,
      toolVersion: entry.toolVersion,
      argsFingerprint: computeArgsFingerprint(entry.toolId, commitArgs),
      previewHash: entry.previewHash,
      destination: entry.destination,
      expiresAt: entry.expiresAt,
      previewShown: true,
      confirmedByUser: true,
    });

    return { ok: true, confirmation };
  }

  /**
   * Cancela irreversivelmente uma proposta pendente ou confirmada (não executada).
   */
  cancelProposal(params: {
    readonly proposalId: string;
    readonly userId: string;
    readonly sessionId: string;
  }): boolean {
    const entry = this.proposals.get(params.proposalId);
    if (!entry) return false;
    if (entry.userId !== params.userId || entry.sessionId !== params.sessionId) return false;
    if (entry.status === "executed" || entry.status === "executing") return false;
    entry.status = "cancelled";
    return true;
  }

  /**
   * Etapa 4 — Claim síncrono, atômico e de uso único antes de qualquer I/O assíncrono.
   * Impede replay, clique duplo concorrente, confirmação fabricada, expiração,
   * cancelamento, alteração pós-aprovação e troca de conta/sessão A→B.
   */
  claimConfirmedProposalForExecution(params: {
    readonly confirmation: ToolWriteConfirmation;
    readonly userId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly toolId: SkillToolName;
    readonly toolVersion: string;
    readonly argsFingerprint: string;
    readonly expectedProposalId: string;
    readonly nowMs?: number;
  }): ProposalClaimResult {
    const { confirmation } = params;
    const entry = this.proposals.get(params.expectedProposalId);
    if (!entry) {
      return {
        ok: false,
        reason: "confirmation_invalid",
        message: "Confirmação não corresponde a nenhuma proposta preparada confiável.",
      };
    }

    if (entry.status === "cancelled") {
      return {
        ok: false,
        reason: "confirmation_cancelled",
        message: "Proposta foi cancelada pelo usuário.",
      };
    }

    if (entry.status === "executing" || entry.status === "executed" || entry.status === "failed") {
      return {
        ok: false,
        reason: "confirmation_replayed",
        message: "Confirmação já consumida ou em execução concorrente.",
      };
    }

    const session = SessionOperationManager.current();
    if (
      session.suspended ||
      !session.userId ||
      session.userId !== params.userId ||
      session.userId !== entry.userId ||
      session.generation !== entry.sessionGeneration ||
      confirmation.sessionGeneration !== entry.sessionGeneration
    ) {
      return {
        ok: false,
        reason: "session_changed",
        message: "Sessão ativa alterada após a preparação ou confirmação da proposta.",
      };
    }

    if (entry.status !== "confirmed" || !entry.confirmationId) {
      return {
        ok: false,
        reason: "confirmation_required",
        message: "Proposta ainda não recebeu confirmação explícita do usuário.",
      };
    }

    const nowMs = params.nowMs ?? this.clockNowMs();
    if (nowMs > entry.expiresAtMs || (confirmation.expiresAt && nowMs > Date.parse(confirmation.expiresAt))) {
      return {
        ok: false,
        reason: "confirmation_expired",
        message: "Confirmação expirada; prepare e confirme novamente a proposta.",
      };
    }

    if (
      confirmation.confirmedByUser !== true ||
      confirmation.previewShown !== true ||
      confirmation.confirmationId !== entry.confirmationId ||
      confirmation.proposalId !== entry.proposalId ||
      confirmation.userId !== params.userId ||
      confirmation.userId !== entry.userId ||
      confirmation.sessionId !== params.sessionId ||
      confirmation.sessionId !== entry.sessionId ||
      confirmation.turnId !== params.turnId ||
      confirmation.turnId !== entry.turnId ||
      confirmation.toolId !== params.toolId ||
      confirmation.toolId !== entry.toolId ||
      confirmation.toolVersion !== params.toolVersion ||
      confirmation.toolVersion !== entry.toolVersion ||
      confirmation.destination !== entry.destination ||
      confirmation.argsFingerprint !== params.argsFingerprint ||
      !confirmation.previewHash ||
      confirmation.previewHash !== entry.previewHash
    ) {
      return {
        ok: false,
        reason: "confirmation_invalid",
        message: "Vínculo de confirmação inválido (identidade, turno, ferramenta, argumentos, destino ou hash).",
      };
    }

    // Recomputa SHA-256 sobre a proposta armazenada para garantir integridade pós-aprovação
    const recomputedHash = computeProposalIntegrityHash({
      toolId: entry.toolId,
      toolVersion: entry.toolVersion,
      userId: entry.userId,
      sessionId: entry.sessionId,
      sessionGeneration: entry.sessionGeneration,
      turnId: entry.turnId,
      destination: entry.destination,
      canonicalArgs: entry.canonicalArgs,
      preview: entry.preview,
      payload: entry.payload,
    });
    if (recomputedHash !== confirmation.previewHash) {
      return {
        ok: false,
        reason: "confirmation_invalid",
        message: "Proposta alterada após aprovação; execução bloqueada.",
      };
    }

    // Trava síncrona imediata: impede concorrência (clique duplo) e replay
    entry.status = "executing";
    const frozenProposal = this.snapshot(entry);

    let finalized = false;
    const finalize = (outcome: "executed" | "failed") => {
      if (finalized) return;
      finalized = true;
      entry.status = outcome;
    };

    return { ok: true, proposal: frozenProposal, finalize };
  }

  getProposalStatusForTesting(proposalId: string): ToolProposalStatus | undefined {
    return this.proposals.get(proposalId)?.status;
  }

  clear(): void {
    this.proposals.clear();
  }
}

export const defaultToolConfirmationService = new ToolConfirmationService();
