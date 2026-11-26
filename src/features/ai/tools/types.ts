/**
 * StudyAI — Tool Engine (TE-1)
 * Contrato canônico versionado de ferramentas, protocolo de intenção,
 * contexto confiável, confirmação de escrita e auditoria sanitizada.
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §2–§7.
 * Nenhuma ferramenta real é conectada na TE-1.
 */

import type { SkillToolName } from "@/features/ai/skills/types";

export type ToolClass = "read" | "transform" | "write" | "execution";

export type ToolScopeName =
  | "account"
  | "study"
  | "library"
  | "performance"
  | "errors"
  | "plan";

export type ToolPrimitiveType = "string" | "number" | "boolean" | "array" | "object";

export interface ToolPropertySchema {
  readonly type: ToolPrimitiveType;
  readonly description?: string;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly maxItems?: number;
  readonly enum?: readonly (string | number | boolean)[];
  readonly items?: ToolPropertySchema;
  readonly properties?: Readonly<Record<string, ToolPropertySchema>>;
  readonly required?: readonly string[];
}

export interface ToolObjectSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, ToolPropertySchema>>;
  readonly required?: readonly string[];
  /** Sempre false no Tool Gateway: rejeita campos extras não autorizados. */
  readonly additionalProperties: false;
}

export interface ToolScopeContract {
  readonly requiredScopes: readonly ToolScopeName[];
  /** Ferramentas nunca podem acessar dados de outra conta. */
  readonly crossAccountAllowed: false;
}

export interface ToolLimitsContract {
  readonly timeoutMs: number;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly maxItems: number;
  readonly maxDepth: number;
  /** Capado pelo teto global de 3 chamadas por turno (STUDYAI_TOOL_ENGINE.md §5). */
  readonly maxCallsPerTurn: number;
}

export interface ToolAuditContract {
  readonly recordDuration: boolean;
  /** Auditoria nunca pode registrar conteúdo do aluno, prompts ou argumentos brutos. */
  readonly includeStudentContent: false;
  readonly allowedMetadataFields: readonly string[];
}

export interface ToolTestsContract {
  readonly deterministicFixtures: boolean;
  readonly description: string;
}

/**
 * Contrato oficial completo de ferramenta (STUDYAI_TOOL_ENGINE.md §3).
 */
export interface ToolSpec {
  readonly id: SkillToolName;
  readonly version: string;
  readonly class: ToolClass;
  readonly description: string;
  readonly inputSchema: ToolObjectSchema;
  readonly outputSchema: ToolObjectSchema;
  readonly scope: ToolScopeContract;
  readonly limits: ToolLimitsContract;
  readonly requiresConfirmation: boolean;
  readonly audit: ToolAuditContract;
  readonly tests: ToolTestsContract;
  /** Distingue ferramenta registrada de ferramenta efetivamente disponível. */
  readonly available: boolean;
}

/**
 * Protocolo inicial de intenção produzida pelo modelo (dado não confiável).
 */
export interface ToolIntent {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * Confirmação explícita do usuário para ferramentas de escrita (STUDYAI_TOOL_ENGINE.md §5).
 * Nunca aceita `confirmed=true` vindo nos argumentos da IA.
 */
export interface ToolWriteConfirmation {
  readonly confirmationId: string;
  readonly userId: string;
  readonly sessionId?: string;
  readonly sessionGeneration?: number;
  readonly turnId: string;
  readonly toolId: SkillToolName;
  readonly toolVersion?: string;
  readonly proposalId?: string;
  readonly argsFingerprint: string;
  readonly previewHash?: string;
  readonly destination?: string;
  readonly expiresAt?: string;
  readonly previewShown: true;
  readonly confirmedByUser: true;
}

/**
 * Contexto confiável originado da sessão/aplicação, nunca dos argumentos da IA.
 */
export interface ToolTrustedContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly skillId: string;
  readonly skillVersion?: string;
  readonly grantedScopes: readonly ToolScopeName[];
  readonly grantedPermissions: readonly ToolClass[];
  readonly confirmation?: ToolWriteConfirmation;
  readonly allowReentryCheck?: boolean;
}

export type ToolDenialReason =
  | "tools_disabled"
  | "invalid_trusted_context"
  | "invalid_intent_format"
  | "prototype_pollution_blocked"
  | "override_attempt_blocked"
  | "unknown_tool"
  | "tool_unavailable"
  | "unknown_skill"
  | "tool_not_authorized_for_skill"
  | "permission_denied"
  | "scope_mismatch"
  | "turn_limit_exceeded"
  | "recursion_blocked"
  | "loop_detected"
  | "confirmation_required"
  | "confirmation_invalid"
  | "confirmation_expired"
  | "confirmation_cancelled"
  | "confirmation_replayed"
  | "precondition_failed"
  | "invalid_arguments"
  | "session_changed"
  | "execution_timeout"
  | "execution_failed"
  | "invalid_output";

/**
 * Evento de auditoria estritamente sanitizado (STUDYAI_TOOL_ENGINE.md §5).
 * Proibido conter conteúdo do aluno, prompts, argumentos brutos, saídas ou credenciais.
 */
export interface ToolAuditEvent {
  readonly eventId: string;
  readonly timestamp: string;
  readonly toolId: string;
  readonly toolVersion?: string;
  readonly toolClass?: ToolClass;
  readonly skillId: string;
  readonly skillVersion?: string;
  readonly status: "executed" | "denied" | "failed";
  readonly denialReason?: ToolDenialReason;
  readonly callsInTurn: number;
  readonly maxCallsPerTurn: number;
  readonly durationMs: number;
  /** Explicita natureza da auditoria na TE-1 (em memória sanitizada; sem tabela/serviço externo). */
  readonly auditMode: "in_memory_sanitized";
}

export type ToolAuditSink = (event: ToolAuditEvent) => void;

export type ToolExecutorFn = (
  args: Readonly<Record<string, unknown>>,
  context: Readonly<{
    userId: string;
    sessionId: string;
    turnId: string;
    skillId: string;
    confirmation?: ToolWriteConfirmation;
    confirmationService?: unknown;
    approvedProposal?: Readonly<Record<string, unknown>>;
  }>,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface ToolGatewayResult {
  readonly ok: boolean;
  readonly status: "executed" | "denied" | "failed";
  readonly toolId: string;
  readonly toolVersion?: string;
  readonly denialReason?: ToolDenialReason;
  readonly sanitizedError?: string;
  readonly output?: Readonly<Record<string, unknown>>;
  /** Saída delimitada via UntrustedDataBoundary para retorno seguro ao modelo/consumidor. */
  readonly wrappedOutput?: string;
  readonly callsInTurn: number;
  readonly maxCallsPerTurn: number;
  readonly auditEvent: ToolAuditEvent;
}
