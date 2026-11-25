/**
 * StudyAI — Intelligence Engine (IE-1)
 * Registro determinístico e imutável de Skills Pedagógicas (SkillRegistry).
 * 
 * Conforme STUDYAI_INTELLIGENCE_ENGINE.md e STUDYAI_FUTURE_ROADMAP.md:
 * - Validação de schema, semver e campos obrigatórios no registro.
 * - Rejeição de duplicidade (mesmo id + versão).
 * - Imutabilidade das definições registradas (Object.freeze).
 * - Resolução de versão semver (exata ou última versão estável).
 * - Armazenamento estático em memória (TypeScript puro, sem alteração de schema de banco).
 */

import type { SkillSpec } from "./types";

export class DuplicateSkillError extends Error {
  constructor(id: string, version: string) {
    super(`Skill já registrada com id "${id}" e versão "${version}".`);
    this.name = "DuplicateSkillError";
  }
}

export class InvalidSkillError extends Error {
  constructor(id: string, reason: string) {
    super(`Skill inválida "${id}": ${reason}`);
    this.name = "InvalidSkillError";
  }
}

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const ID_REGEX = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;

/**
 * Compara duas versões semver: retorna >0 se v1 > v2, <0 se v1 < v2, 0 se iguais.
 */
export function compareSemver(v1: string, v2: string): number {
  const m1 = v1.match(SEMVER_REGEX);
  const m2 = v2.match(SEMVER_REGEX);
  if (!m1 || !m2) {
    return v1.localeCompare(v2);
  }
  const major1 = parseInt(m1[1], 10);
  const minor1 = parseInt(m1[2], 10);
  const patch1 = parseInt(m1[3], 10);

  const major2 = parseInt(m2[1], 10);
  const minor2 = parseInt(m2[2], 10);
  const patch2 = parseInt(m2[3], 10);

  if (major1 !== major2) return major1 - major2;
  if (minor1 !== minor2) return minor1 - minor2;
  if (patch1 !== patch2) return patch1 - patch2;

  // Prerelease (sem pre-release é mais recente que com pre-release)
  const pre1 = m1[4];
  const pre2 = m2[4];
  if (!pre1 && pre2) return 1;
  if (pre1 && !pre2) return -1;
  if (pre1 && pre2) return pre1.localeCompare(pre2);

  return 0;
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export class SkillRegistryImpl {
  /**
   * Armazenamento chaveado por `${id}@${version}`.
   */
  private readonly registry = new Map<string, SkillSpec>();

  /**
   * Valida a especificação contra o contrato mínimo do IE-1 antes do registro.
   */
  private validateSpec(spec: SkillSpec): void {
    if (!spec.id || typeof spec.id !== "string" || !ID_REGEX.test(spec.id)) {
      throw new InvalidSkillError(spec.id ?? "unknown", "id deve ser uma string não vazia contendo identificadores válidos em minúsculas (ex: 'teacher.dialogue').");
    }
    if (!spec.version || typeof spec.version !== "string" || !SEMVER_REGEX.test(spec.version)) {
      throw new InvalidSkillError(spec.id, `versão "${spec.version}" deve seguir especificação semver válida (ex: "1.0.0", "0.1.0").`);
    }
    if (!spec.objective || typeof spec.objective !== "string" || spec.objective.trim().length === 0) {
      throw new InvalidSkillError(spec.id, "objetivo pedagógico obrigatório não pode ser vazio.");
    }
    if (!Array.isArray(spec.triggers) || spec.triggers.length === 0) {
      throw new InvalidSkillError(spec.id, "ao menos um gatilho (trigger) deve ser declarado.");
    }
    if (!spec.inputs || typeof spec.inputs !== "object" || !spec.inputs.schema) {
      throw new InvalidSkillError(spec.id, "inputs.schema deve ser um objeto válido.");
    }
    if (!Array.isArray(spec.allowedContext)) {
      throw new InvalidSkillError(spec.id, "allowedContext deve ser um array de contextos permitidos.");
    }
    if (!Array.isArray(spec.allowedTools)) {
      throw new InvalidSkillError(spec.id, "allowedTools deve ser um array de ferramentas permitidas.");
    }
    if (!spec.output || typeof spec.output !== "object" || !spec.output.type) {
      throw new InvalidSkillError(spec.id, "output deve declarar um type válido ('text', 'json' ou 'mermaid').");
    }
    if (!spec.tokenBudget || typeof spec.tokenBudget !== "object" || spec.tokenBudget.input <= 0 || spec.tokenBudget.output <= 0) {
      throw new InvalidSkillError(spec.id, "tokenBudget deve declarar limites positivos para input e output.");
    }
    if (!spec.safety || typeof spec.safety !== "object") {
      throw new InvalidSkillError(spec.id, "safety deve conter as regras de segurança.");
    }
    if (!spec.qualityCriteria || !Array.isArray(spec.qualityCriteria.criteria)) {
      throw new InvalidSkillError(spec.id, "qualityCriteria deve declarar um array de critérios.");
    }
    if (!spec.fallback || typeof spec.fallback.content !== "string") {
      throw new InvalidSkillError(spec.id, "fallback deve conter conteúdo textual de emergência seguro.");
    }
  }

  /**
   * Registra uma nova SkillSpec imutável.
   * Lança `DuplicateSkillError` se a mesma versão já existir.
   */
  public register(spec: SkillSpec): void {
    this.validateSpec(spec);
    const key = `${spec.id}@${spec.version}`;
    if (this.registry.has(key)) {
      throw new DuplicateSkillError(spec.id, spec.version);
    }
    // Deep freeze para garantir imutabilidade absoluta no runtime
    const frozenSpec = deepFreeze({ ...spec });
    this.registry.set(key, frozenSpec);
  }

  /**
   * Obtém uma SkillSpec. Se version não for informada, resolve para a maior versão semver.
   */
  public get(id: string, version?: string): SkillSpec | undefined {
    if (version) {
      return this.registry.get(`${id}@${version}`);
    }
    // Resolver maior versão registrada para o id
    const versions = this.listVersions(id);
    if (versions.length === 0) {
      return undefined;
    }
    const latestVersion = [...versions].sort(compareSemver).pop()!;
    return this.registry.get(`${id}@${latestVersion}`);
  }

  /**
   * Verifica se uma skill está registrada.
   */
  public has(id: string, version?: string): boolean {
    return this.get(id, version) !== undefined;
  }

  /**
   * Lista todas as versões registradas para um id específico.
   */
  public listVersions(id: string): readonly string[] {
    const prefix = `${id}@`;
    const versions: string[] = [];
    for (const key of this.registry.keys()) {
      if (key.startsWith(prefix)) {
        versions.push(key.slice(prefix.length));
      }
    }
    return versions.sort(compareSemver);
  }

  /**
   * Lista a versão mais recente de cada skill cadastrada.
   */
  public list(): readonly SkillSpec[] {
    const ids = new Set<string>();
    for (const key of this.registry.keys()) {
      const atIndex = key.indexOf("@");
      if (atIndex > 0) {
        ids.add(key.slice(0, atIndex));
      }
    }
    const results: SkillSpec[] = [];
    for (const id of ids) {
      const spec = this.get(id);
      if (spec) {
        results.push(spec);
      }
    }
    return results;
  }

  /**
   * Retorna todas as versões de todas as skills registradas.
   */
  public listAll(): readonly SkillSpec[] {
    return Array.from(this.registry.values());
  }

  /**
   * Limpa o registro (usado para isolamento em testes).
   */
  public clear(): void {
    this.registry.clear();
  }

  /**
   * Restaura o registro com as skills padrão.
   */
  public resetToDefaults(): void {
    this.clear();
    registerTeacherDefaultSkills(this);
  }
}

/** Instância singleton global do registro de skills */
export const SkillRegistry = new SkillRegistryImpl();

// Hook de registro adiado de skills padrão do Teacher
let defaultRegistrationHandler: ((registry: SkillRegistryImpl) => void) | null = null;

export function setDefaultRegistrationHandler(handler: (registry: SkillRegistryImpl) => void): void {
  defaultRegistrationHandler = handler;
  // Inicializa o registro agora se o handler foi fornecido
  defaultRegistrationHandler(SkillRegistry);
}

function registerTeacherDefaultSkills(registry: SkillRegistryImpl): void {
  if (defaultRegistrationHandler) {
    defaultRegistrationHandler(registry);
  }
}
