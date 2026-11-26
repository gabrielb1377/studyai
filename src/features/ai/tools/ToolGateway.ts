/**
 * StudyAI — Tool Engine (TE-1 / TE-3 / TE-4)
 * Tool Gateway controlado para intenções estruturadas.
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §1–§9:
 * - Flag `tools.enabled` desligada por padrão.
 * - Identidade, escopo, permissões e confirmação vêm exclusivamente de `ToolTrustedContext`.
 * - Declaração em `skill.allowedTools` não autoriza execução sozinha: exige registro,
 *   disponibilidade, escopo, permissão, limite de turno e confirmação para escrita/commit.
 * - Operações `mode: "commit"` exigem permissão `"write"` + proposta preparada e confirmada
 *   em `ToolConfirmationService` (com claim síncrono atômico e hash SHA-256).
 * - Saída validada por esquema e delimitada via `UntrustedDataBoundary` (PS-1a/PS-1b).
 * - Auditoria sanitizada sem conteúdo do aluno, argumentos brutos ou credenciais.
 * - Nota de fronteira: o Gateway no cliente NÃO substitui autorização real no servidor.
 */

import { SessionChangedError, SessionOperationManager } from "@/features/account/SessionOperationManager";
import { SkillRegistry } from "@/features/ai/skills/SkillRegistry";
import { wrapUntrustedMaterialData } from "@/features/ai/UntrustedDataBoundary";
import { isToolsEnabled } from "./config";
import {
  PreconditionFailedError,
  ToolConfirmationService,
  defaultToolConfirmationService,
  type ToolProposalRecord,
} from "./ToolConfirmationService";
import { GLOBAL_MAX_TOOL_CALLS_PER_TURN, ToolRegistry, type ToolRegistryImpl } from "./ToolRegistry";
import { computeArgsFingerprint, parseToolIntent, validateObjectAgainstSchema } from "./ToolSchemaValidator";
import { ToolTurnManager } from "./ToolTurnState";
import type {
  ToolAuditEvent,
  ToolAuditSink,
  ToolClass,
  ToolDenialReason,
  ToolGatewayResult,
  ToolTrustedContext,
} from "./types";

let auditSeq = 0;

function nextAuditId(): string {
  auditSeq += 1;
  return `tool-audit-${Date.now()}-${auditSeq}`;
}

export interface ToolGatewayOptions {
  readonly registry?: ToolRegistryImpl;
  readonly turnManager?: ToolTurnManager;
  readonly confirmationService?: ToolConfirmationService;
  readonly auditSink?: ToolAuditSink;
  readonly nowMs?: () => number;
}

export const MAX_AUDIT_LOG_ENTRIES = 500;

export class ToolGateway {
  private readonly registry: ToolRegistryImpl;
  private readonly turnManager: ToolTurnManager;
  private readonly confirmationService: ToolConfirmationService;
  private readonly auditSink?: ToolAuditSink;
  private readonly nowMs: () => number;
  private readonly auditLog: ToolAuditEvent[] = [];

  constructor(options: ToolGatewayOptions = {}) {
    this.registry = options.registry ?? ToolRegistry;
    this.turnManager = options.turnManager ?? new ToolTurnManager();
    this.confirmationService = options.confirmationService ?? defaultToolConfirmationService;
    this.auditSink = options.auditSink;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  getConfirmationService(): ToolConfirmationService {
    return this.confirmationService;
  }

  getAuditLog(): readonly ToolAuditEvent[] {
    return this.auditLog;
  }

  private emitAudit(event: ToolAuditEvent): ToolAuditEvent {
    const frozen = Object.freeze(event);
    if (this.auditLog.length >= MAX_AUDIT_LOG_ENTRIES) {
      this.auditLog.shift();
    }
    this.auditLog.push(frozen);
    if (this.auditSink) {
      try {
        this.auditSink(frozen);
      } catch {
        // Falha no sink de auditoria nunca deve expor erro interno ao executor
      }
    }
    return frozen;
  }

  private deny(params: {
    readonly startedAt: number;
    readonly toolId: string;
    readonly toolVersion?: string;
    readonly toolClass?: ToolClass;
    readonly skillId: string;
    readonly skillVersion?: string;
    readonly reason: ToolDenialReason;
    readonly message: string;
    readonly callsInTurn: number;
    readonly maxCallsPerTurn?: number;
  }): ToolGatewayResult {
    const auditEvent = this.emitAudit({
      eventId: nextAuditId(),
      timestamp: new Date().toISOString(),
      toolId: params.toolId,
      toolVersion: params.toolVersion,
      toolClass: params.toolClass,
      skillId: params.skillId,
      skillVersion: params.skillVersion,
      status: "denied",
      denialReason: params.reason,
      callsInTurn: params.callsInTurn,
      maxCallsPerTurn: params.maxCallsPerTurn ?? GLOBAL_MAX_TOOL_CALLS_PER_TURN,
      durationMs: Math.max(0, Date.now() - params.startedAt),
      auditMode: "in_memory_sanitized",
    });

    return {
      ok: false,
      status: "denied",
      toolId: params.toolId,
      toolVersion: params.toolVersion,
      denialReason: params.reason,
      sanitizedError: params.message,
      callsInTurn: params.callsInTurn,
      maxCallsPerTurn: params.maxCallsPerTurn ?? GLOBAL_MAX_TOOL_CALLS_PER_TURN,
      auditEvent,
    };
  }

  async execute(rawIntent: unknown, trustedContext: ToolTrustedContext): Promise<ToolGatewayResult> {
    const startedAt = Date.now();
    const safeSkillId = trustedContext?.skillId?.trim() || "unknown";

    // 1. Flag tools.enabled desligada por padrão
    if (!isToolsEnabled()) {
      return this.deny({
        startedAt,
        toolId: "unknown",
        skillId: safeSkillId,
        reason: "tools_disabled",
        message: "Tool Gateway desabilitado (tools.enabled=false).",
        callsInTurn: 0,
      });
    }

    // 2. Validação do contexto confiável (identidade, sessão, turno e skill)
    if (
      !trustedContext ||
      !trustedContext.userId?.trim() ||
      !trustedContext.sessionId?.trim() ||
      !trustedContext.turnId?.trim() ||
      !trustedContext.skillId?.trim()
    ) {
      return this.deny({
        startedAt,
        toolId: "unknown",
        skillId: safeSkillId,
        reason: "invalid_trusted_context",
        message: "Contexto confiável de sessão/turno/skill ausente ou inválido.",
        callsInTurn: 0,
      });
    }

    const callsBefore = this.turnManager.getCallsInTurn(
      trustedContext.userId,
      trustedContext.sessionId,
      trustedContext.turnId,
    );

    // 3. Resolução confiável da skill no SkillRegistry
    const skillSpec = SkillRegistry.get(trustedContext.skillId, trustedContext.skillVersion);
    if (!skillSpec) {
      return this.deny({
        startedAt,
        toolId: "unknown",
        skillId: trustedContext.skillId,
        skillVersion: trustedContext.skillVersion,
        reason: "unknown_skill",
        message: "Skill solicitante não encontrada no registro confiável.",
        callsInTurn: callsBefore,
      });
    }

    // 4. Parse estrito do protocolo de intenção {"tool":"<id>","args":{...}}
    const parsed = parseToolIntent(rawIntent);
    if (!parsed.ok) {
      return this.deny({
        startedAt,
        toolId: "unknown",
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: parsed.reason,
        message: parsed.error,
        callsInTurn: callsBefore,
      });
    }

    const { tool: toolId, args } = parsed.intent;

    // 5. Resolução da ferramenta no registro confiável
    const registered = this.registry.get(toolId);
    if (!registered) {
      return this.deny({
        startedAt,
        toolId,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: "unknown_tool",
        message: "Ferramenta desconhecida ou não registrada.",
        callsInTurn: callsBefore,
      });
    }

    const { spec, executor } = registered;

    if (!spec.available) {
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: "tool_unavailable",
        message: "Ferramenta registrada, mas indisponível neste ambiente.",
        callsInTurn: callsBefore,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    // 6. Autorização cruzada: skill.allowedTools + permissão de classe + escopo
    if (!skillSpec.allowedTools.includes(spec.id)) {
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: "tool_not_authorized_for_skill",
        message: "Ferramenta não autorizada para a skill ativa.",
        callsInTurn: callsBefore,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    const isCommitMode = args.mode === "commit";

    if (!trustedContext.grantedPermissions.includes(spec.class)) {
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: "permission_denied",
        message: "Permissão insuficiente para a classe de ferramenta solicitada.",
        callsInTurn: callsBefore,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    if (isCommitMode && !trustedContext.grantedPermissions.includes("write")) {
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: "permission_denied",
        message: "Persistência confirmada exige permissão confiável de escrita.",
        callsInTurn: callsBefore,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    const missingScope = spec.scope.requiredScopes.find(
      (reqScope) => !trustedContext.grantedScopes.includes(reqScope),
    );
    if (missingScope) {
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: "scope_mismatch",
        message: "Escopo confiável incompatível com o contrato da ferramenta.",
        callsInTurn: callsBefore,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    // 7. Validação estrita dos argumentos contra inputSchema e limites
    const inputCheck = validateObjectAgainstSchema(args, spec.inputSchema, spec.limits, "input");
    if (!inputCheck.valid) {
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: "invalid_arguments",
        message: "Argumentos da ferramenta violam o esquema ou limites declarados.",
        callsInTurn: callsBefore,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    const fingerprint = computeArgsFingerprint(spec.id, args);
    const requiresWriteConfirmation = spec.class === "write" || spec.requiresConfirmation || isCommitMode;
    const nowMs = this.nowMs();

    // 8. Confirmação obrigatória para escrita ou commit de proposta preparada
    if (requiresWriteConfirmation) {
      const conf = trustedContext.confirmation;
      if (!conf) {
        return this.deny({
          startedAt,
          toolId: spec.id,
          toolVersion: spec.version,
          toolClass: spec.class,
          skillId: skillSpec.id,
          skillVersion: skillSpec.version,
          reason: "confirmation_required",
          message: "Operação de escrita exige pré-visualização e confirmação explícita do usuário.",
          callsInTurn: callsBefore,
          maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        });
      }

      if (conf.sessionGeneration !== undefined) {
        const activeSession = SessionOperationManager.current();
        if (
          activeSession.suspended ||
          activeSession.userId !== trustedContext.userId ||
          activeSession.generation !== conf.sessionGeneration
        ) {
          return this.deny({
            startedAt,
            toolId: spec.id,
            toolVersion: spec.version,
            toolClass: spec.class,
            skillId: skillSpec.id,
            skillVersion: skillSpec.version,
            reason: "session_changed",
            message: "Sessão ativa alterada ou suspensa após confirmação.",
            callsInTurn: callsBefore,
            maxCallsPerTurn: spec.limits.maxCallsPerTurn,
          });
        }
      }

      if (conf.expiresAt !== undefined && nowMs > Date.parse(conf.expiresAt)) {
        return this.deny({
          startedAt,
          toolId: spec.id,
          toolVersion: spec.version,
          toolClass: spec.class,
          skillId: skillSpec.id,
          skillVersion: skillSpec.version,
          reason: "confirmation_expired",
          message: "Confirmação expirada; prepare e confirme novamente a proposta.",
          callsInTurn: callsBefore,
          maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        });
      }

      if (
        conf.confirmedByUser !== true ||
        conf.previewShown !== true ||
        !conf.confirmationId?.trim() ||
        conf.userId !== trustedContext.userId ||
        (conf.sessionId !== undefined && conf.sessionId !== trustedContext.sessionId) ||
        conf.turnId !== trustedContext.turnId ||
        conf.toolId !== spec.id ||
        (conf.toolVersion !== undefined && conf.toolVersion !== spec.version) ||
        conf.argsFingerprint !== fingerprint
      ) {
        return this.deny({
          startedAt,
          toolId: spec.id,
          toolVersion: spec.version,
          toolClass: spec.class,
          skillId: skillSpec.id,
          skillVersion: skillSpec.version,
          reason: "confirmation_invalid",
          message: "Confirmação de escrita inválida ou incompatível com usuário, sessão, turno ou argumentos.",
          callsInTurn: callsBefore,
          maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        });
      }

      if (
        this.turnManager.isConfirmationUsed(
          trustedContext.userId,
          trustedContext.sessionId,
          trustedContext.turnId,
          conf.confirmationId,
        )
      ) {
        return this.deny({
          startedAt,
          toolId: spec.id,
          toolVersion: spec.version,
          toolClass: spec.class,
          skillId: skillSpec.id,
          skillVersion: skillSpec.version,
          reason: "confirmation_replayed",
          message: "Confirmação de escrita já utilizada e não pode ser reaproveitada.",
          callsInTurn: callsBefore,
          maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        });
      }
    }

    // 8b. Se for commit de proposta TE-4, valida status da proposta antes de consumir slot de turno
    // (evita que replay/cancelada/expirada seja mascarado por loop_detected ou consuma slot).
    const commitProposalId =
      isCommitMode && typeof args.proposalId === "string" ? args.proposalId : undefined;
    if (isCommitMode && !commitProposalId) {
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: "confirmation_invalid",
        message: "Identificador de proposta ausente para operação confirmada.",
        callsInTurn: callsBefore,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    if (isCommitMode && commitProposalId) {
      const status = this.confirmationService.getProposalStatusForTesting(commitProposalId);
      if (status === "cancelled") {
        return this.deny({
          startedAt,
          toolId: spec.id,
          toolVersion: spec.version,
          toolClass: spec.class,
          skillId: skillSpec.id,
          skillVersion: skillSpec.version,
          reason: "confirmation_cancelled",
          message: "Proposta foi cancelada pelo usuário e não pode ser executada.",
          callsInTurn: callsBefore,
          maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        });
      }
      if (status === "executing" || status === "executed" || status === "failed") {
        return this.deny({
          startedAt,
          toolId: spec.id,
          toolVersion: spec.version,
          toolClass: spec.class,
          skillId: skillSpec.id,
          skillVersion: skillSpec.version,
          reason: "confirmation_replayed",
          message: "Proposta já consumida ou em execução concorrente.",
          callsInTurn: callsBefore,
          maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        });
      }
    }

    // 9. Verificação prévia de limite/loop/recursão SEM mutar o turno ainda
    const preSlot = this.turnManager.canAcquireSlot({
      userId: trustedContext.userId,
      sessionId: trustedContext.sessionId,
      turnId: trustedContext.turnId,
      fingerprint,
      maxCallsForTool: spec.limits.maxCallsPerTurn,
      blockIfActive: trustedContext.allowReentryCheck === true,
    });

    if (!preSlot.ok) {
      const reasonMessages: Record<typeof preSlot.reason, string> = {
        turn_limit_exceeded: "Limite máximo de chamadas de ferramentas por turno excedido.",
        recursion_blocked: "Execução recursiva ou reentrante de ferramenta bloqueada.",
        loop_detected: "Repetição idêntica de intenção bloqueada para prevenir loop.",
      };
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: preSlot.reason,
        message: reasonMessages[preSlot.reason],
        callsInTurn: preSlot.callsInTurn,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    // 9b. Claim síncrono atômico da proposta confirmada ANTES de consumir slot/fingerprint do turno
    // (impede que uma confirmação fabricada/inválida envenene o turno ou bloqueie a confirmação legítima)
    let claimedProposal: ToolProposalRecord | undefined;
    let finalizeProposal: ((outcome: "executed" | "failed") => void) | undefined;

    if (isCommitMode && commitProposalId && trustedContext.confirmation) {
      const claim = this.confirmationService.claimConfirmedProposalForExecution({
        confirmation: trustedContext.confirmation,
        userId: trustedContext.userId,
        sessionId: trustedContext.sessionId,
        turnId: trustedContext.turnId,
        toolId: spec.id,
        toolVersion: spec.version,
        argsFingerprint: fingerprint,
        expectedProposalId: commitProposalId,
        nowMs,
      });

      if (!claim.ok) {
        return this.deny({
          startedAt,
          toolId: spec.id,
          toolVersion: spec.version,
          toolClass: spec.class,
          skillId: skillSpec.id,
          skillVersion: skillSpec.version,
          reason: claim.reason,
          message: claim.message,
          callsInTurn: preSlot.callsInTurn,
          maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        });
      }

      claimedProposal = claim.proposal;
      finalizeProposal = claim.finalize;
    }

    // 9c. Reserva síncrona de slot no turno (limite 3/turno, sem loop, sem recursão)
    const slot = this.turnManager.acquireSlot({
      userId: trustedContext.userId,
      sessionId: trustedContext.sessionId,
      turnId: trustedContext.turnId,
      fingerprint,
      maxCallsForTool: spec.limits.maxCallsPerTurn,
      blockIfActive: trustedContext.allowReentryCheck === true,
    });

    if (!slot.ok) {
      finalizeProposal?.("failed");
      const reasonMessages: Record<typeof slot.reason, string> = {
        turn_limit_exceeded: "Limite máximo de chamadas de ferramentas por turno excedido.",
        recursion_blocked: "Execução recursiva ou reentrante de ferramenta bloqueada.",
        loop_detected: "Repetição idêntica de intenção bloqueada para prevenir loop.",
      };
      return this.deny({
        startedAt,
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        reason: slot.reason,
        message: reasonMessages[slot.reason],
        callsInTurn: slot.callsInTurn,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      });
    }

    if (requiresWriteConfirmation && trustedContext.confirmation) {
      this.turnManager.markConfirmationUsed(
        trustedContext.userId,
        trustedContext.sessionId,
        trustedContext.turnId,
        trustedContext.confirmation.confirmationId,
      );
    }

    // 10. Execução isolada com timeout e tratamento seguro de exceções
    let rawOutput: Record<string, unknown>;
    try {
      rawOutput = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = globalThis.setTimeout(() => {
          reject(new Error("__TOOL_TIMEOUT__"));
        }, spec.limits.timeoutMs);

        Promise.resolve(
          executor(
            Object.freeze({ ...args }),
            Object.freeze({
              userId: trustedContext.userId,
              sessionId: trustedContext.sessionId,
              turnId: trustedContext.turnId,
              skillId: skillSpec.id,
              confirmation: trustedContext.confirmation,
              confirmationService: this.confirmationService,
              approvedProposal: claimedProposal as unknown as Readonly<Record<string, unknown>> | undefined,
            }),
          ),
        )
          .then((res) => {
            clearTimeout(timer);
            resolve(res);
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      });
    } catch (err) {
      finalizeProposal?.("failed");
      slot.release();
      const isSessionChanged =
        err instanceof SessionChangedError || (err instanceof Error && err.name === "SessionChangedError");
      const isPreconditionFailed =
        err instanceof PreconditionFailedError ||
        (err instanceof Error && err.name === "PreconditionFailedError");
      const isTimeout = err instanceof Error && err.message === "__TOOL_TIMEOUT__";
      const reason: ToolDenialReason = isSessionChanged
        ? "session_changed"
        : isPreconditionFailed
          ? "precondition_failed"
          : isTimeout
            ? "execution_timeout"
            : "execution_failed";
      const status = isSessionChanged || isPreconditionFailed ? "denied" : "failed";
      const auditEvent = this.emitAudit({
        eventId: nextAuditId(),
        timestamp: new Date().toISOString(),
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        status,
        denialReason: reason,
        callsInTurn: slot.callsInTurn,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        durationMs: Math.max(0, Date.now() - startedAt),
        auditMode: "in_memory_sanitized",
      });
      return {
        ok: false,
        status,
        toolId: spec.id,
        toolVersion: spec.version,
        denialReason: reason,
        sanitizedError: isSessionChanged
          ? "Sessão ausente, suspensa ou alterada durante a operação."
          : isPreconditionFailed
            ? "Pré-condição da operação não foi satisfeita no momento da execução."
            : isTimeout
              ? "Execução da ferramenta excedeu o tempo limite permitido."
              : "Falha segura durante a execução da ferramenta.",
        callsInTurn: slot.callsInTurn,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        auditEvent,
      };
    } finally {
      slot.release();
    }

    // 11. Validação estrita da saída contra outputSchema antes de devolver ao consumidor
    const outputCheck = validateObjectAgainstSchema(rawOutput, spec.outputSchema, spec.limits, "output");
    if (!outputCheck.valid) {
      finalizeProposal?.("failed");
      const auditEvent = this.emitAudit({
        eventId: nextAuditId(),
        timestamp: new Date().toISOString(),
        toolId: spec.id,
        toolVersion: spec.version,
        toolClass: spec.class,
        skillId: skillSpec.id,
        skillVersion: skillSpec.version,
        status: "failed",
        denialReason: "invalid_output",
        callsInTurn: slot.callsInTurn,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        durationMs: Math.max(0, Date.now() - startedAt),
        auditMode: "in_memory_sanitized",
      });
      return {
        ok: false,
        status: "failed",
        toolId: spec.id,
        toolVersion: spec.version,
        denialReason: "invalid_output",
        sanitizedError: "A saída da ferramenta violou o contrato outputSchema.",
        callsInTurn: slot.callsInTurn,
        maxCallsPerTurn: spec.limits.maxCallsPerTurn,
        auditEvent,
      };
    }

    finalizeProposal?.("executed");

    // 12. Delimitação do resultado como dado não confiável (PS-1a/PS-1b)
    const wrappedOutput = wrapUntrustedMaterialData([
      `Resultado da ferramenta ${spec.id}@${spec.version}:`,
      JSON.stringify(rawOutput),
    ]);

    const auditEvent = this.emitAudit({
      eventId: nextAuditId(),
      timestamp: new Date().toISOString(),
      toolId: spec.id,
      toolVersion: spec.version,
      toolClass: spec.class,
      skillId: skillSpec.id,
      skillVersion: skillSpec.version,
      status: "executed",
      callsInTurn: slot.callsInTurn,
      maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      durationMs: Math.max(0, Date.now() - startedAt),
      auditMode: "in_memory_sanitized",
    });

    return {
      ok: true,
      status: "executed",
      toolId: spec.id,
      toolVersion: spec.version,
      output: Object.freeze({ ...rawOutput }),
      wrappedOutput,
      callsInTurn: slot.callsInTurn,
      maxCallsPerTurn: spec.limits.maxCallsPerTurn,
      auditEvent,
    };
  }
}

/**
 * Instância padrão de produção do ToolGateway.
 */
export const defaultToolGateway = new ToolGateway({ registry: ToolRegistry });
