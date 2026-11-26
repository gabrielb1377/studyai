/**
 * StudyAI — Tool Engine (TE-1)
 * Registro imutável e confiável de ferramentas do Tool Gateway.
 *
 * - Reutiliza os identificadores canônicos de SkillToolName.
 * - O registro padrão (`ToolRegistry`) nasce VAZIO (0 ferramentas reais conectadas na TE-1).
 * - Ferramentas sintéticas devem ser registradas apenas em instâncias isoladas de teste.
 */

import type { SkillToolName } from "@/features/ai/skills/types";
import type { ToolExecutorFn, ToolSpec } from "./types";

export const GLOBAL_MAX_TOOL_CALLS_PER_TURN = 3;

const CANONICAL_TOOL_NAMES: ReadonlySet<SkillToolName> = new Set([
  "library",
  "flashcards",
  "performance",
  "quiz",
  "diagram",
  "audio",
  "js_execution",
  "plan",
  "errors",
  "doc_reader",
  "calculator",
]);

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const val of Object.values(obj as Record<string, unknown>)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export interface RegisteredToolEntry {
  readonly spec: ToolSpec;
  readonly executor: ToolExecutorFn;
}

export class ToolRegistryImpl {
  private readonly entries = new Map<string, RegisteredToolEntry>();

  register(spec: ToolSpec, executor: ToolExecutorFn): void {
    if (!CANONICAL_TOOL_NAMES.has(spec.id)) {
      throw new Error(`Identificador de ferramenta não canônico: "${String(spec.id)}".`);
    }
    if (!SEMVER_PATTERN.test(spec.version)) {
      throw new Error(`Versão semver inválida para ferramenta "${spec.id}": "${spec.version}".`);
    }
    if (this.entries.has(spec.id)) {
      throw new Error(`Ferramenta duplicada no registro: "${spec.id}".`);
    }
    if (spec.scope.crossAccountAllowed !== false) {
      throw new Error(`Ferramenta "${spec.id}" não pode permitir acesso cross-account.`);
    }
    if (spec.audit.includeStudentContent !== false) {
      throw new Error(`Ferramenta "${spec.id}" não pode registrar conteúdo do aluno na auditoria.`);
    }
    if (spec.inputSchema.additionalProperties !== false || spec.outputSchema.additionalProperties !== false) {
      throw new Error(`Ferramenta "${spec.id}" deve proibir campos extras (additionalProperties: false).`);
    }
    if (spec.class === "write" && !spec.requiresConfirmation) {
      throw new Error(`Ferramenta de escrita "${spec.id}" exige requiresConfirmation=true.`);
    }
    if (
      spec.limits.maxCallsPerTurn < 1 ||
      spec.limits.maxCallsPerTurn > GLOBAL_MAX_TOOL_CALLS_PER_TURN
    ) {
      throw new Error(
        `Ferramenta "${spec.id}" excede o teto global de ${GLOBAL_MAX_TOOL_CALLS_PER_TURN} chamadas por turno.`,
      );
    }
    if (spec.limits.timeoutMs < 1 || spec.limits.maxInputBytes < 1 || spec.limits.maxOutputBytes < 1) {
      throw new Error(`Limites operacionais inválidos para ferramenta "${spec.id}".`);
    }
    if (typeof executor !== "function") {
      throw new Error(`Executor inválido para ferramenta "${spec.id}".`);
    }

    const frozenSpec = deepFreeze(structuredClone(spec));
    this.entries.set(spec.id, Object.freeze({ spec: frozenSpec, executor }));
  }

  get(id: string): RegisteredToolEntry | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): readonly ToolSpec[] {
    return Array.from(this.entries.values()).map((entry) => entry.spec);
  }

  size(): number {
    return this.entries.size;
  }
}

/**
 * Instância padrão de produção do ToolRegistry.
 * Na TE-1 permanece estritamente vazia (0 ferramentas reais conectadas).
 */
export const ToolRegistry = new ToolRegistryImpl();
