/**
 * StudyAI — Intelligence Engine (IE-1)
 * Tipos e contrato canônico da especificação pedagógica (SkillSpec).
 * 
 * Conforme STUDYAI_INTELLIGENCE_ENGINE.md e STUDYAI_EDUCATIONAL_SKILLS.md:
 * id, version (semver), objective, triggers, inputs, allowedContext,
 * allowedTools, output, tokenBudget, safety, qualityCriteria, tests, fallback.
 */

export type SkillTriggerType = "action" | "intent" | "explicit" | "rule";

export interface SkillTrigger {
  readonly type: SkillTriggerType;
  readonly value: string;
  readonly description?: string;
}

/**
 * Blocos de contexto que a skill pode consumir.
 * Contexto progressivo: a skill declara quais blocos aceita e o planejador
 * só busca o que ela permite.
 */
export type SkillContextType =
  | "study"
  | "chunks"
  | "profile"
  | "memory"
  | "errors"
  | "selection"
  | "history"
  | "library";

/**
 * Ferramentas autorizadas para a skill.
 * Conforme catálogo de 20 skills e Tool Engine.
 */
export type SkillToolName =
  | "library"
  | "flashcards"
  | "performance"
  | "quiz"
  | "diagram"
  | "audio"
  | "js_execution"
  | "plan"
  | "errors"
  | "doc_reader"
  | "calculator";

export interface SkillTokenBudget {
  readonly input: number;
  readonly output: number;
}

export interface SkillSafetyRules {
  readonly doNotLeakInstructions?: boolean;
  readonly untrustedInputDelimited?: boolean;
  readonly requireSourceGrounding?: boolean;
  readonly forbiddenOutputs?: readonly string[];
  readonly customRules?: readonly string[];
}

export interface SkillQualityCriteria {
  readonly criteria: readonly string[];
  readonly maxOutputWords?: number;
  readonly requiredSections?: readonly string[];
  readonly schemaValidation?: boolean;
}

export interface SkillTestCase {
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly expectedValid?: boolean;
  readonly criteriaChecks?: readonly string[];
}

export type SkillOutputType = "text" | "json" | "mermaid";

export interface SkillOutput {
  readonly type: SkillOutputType;
  readonly formatDescription?: string;
  readonly example?: string;
  readonly schema?: Record<string, unknown>;
  readonly requiredKeys?: readonly string[];
  readonly validator?: (output: string) => SkillValidationResult | { valid: boolean; errors: readonly string[] };
}

export interface SkillFallback {
  readonly type: "text" | "json" | "static";
  readonly content: string;
  readonly description?: string;
}

/**
 * Contrato canônico completo de uma Skill Pedagógica.
 */
export interface SkillSpec {
  readonly id: string;
  readonly version: string; // semver (ex: "1.0.0", "0.1.0")
  readonly objective: string;
  readonly triggers: readonly SkillTrigger[];
  readonly inputs: {
    readonly schema: Record<string, unknown>;
    readonly required?: readonly string[];
  };
  readonly allowedContext: readonly SkillContextType[];
  readonly allowedTools: readonly SkillToolName[];
  readonly output: SkillOutput;
  readonly tokenBudget: SkillTokenBudget;
  readonly safety: SkillSafetyRules;
  readonly qualityCriteria: SkillQualityCriteria;
  readonly tests?: readonly SkillTestCase[];
  readonly fallback: SkillFallback;

  /**
   * Construtor opcional de diretriz pedagógica / instrução para paridade estrita
   * com TeacherPromptBuilder.
   */
  readonly buildInstruction?: (params: { request: unknown; options?: { omitSelection?: boolean } } | unknown) => string;
  /**
   * Construtor opcional de mensagem de ação enviada pelo usuário.
   */
  readonly buildActionMessage?: (params: unknown) => string;
}

export interface SkillValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly parsed?: unknown;
}

export interface SkillRepairResult {
  readonly success: boolean;
  readonly output: string;
  readonly repaired: boolean;
  readonly fallbackUsed: boolean;
  readonly errors?: readonly string[];
  readonly attempts: number;
}
