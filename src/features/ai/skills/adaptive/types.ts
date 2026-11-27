/**
 * StudyAI — Adaptive Learning (AL-1)
 * Contratos tipados para seleção determinística, explicável e desativável
 * de skill, nível e método pedagógico.
 *
 * Princípios:
 * - Zero chamadas adicionais de IA para selecionar a skill.
 * - Seleção estritamente separada da execução de skills ou ferramentas.
 * - Reutiliza exclusivamente skills compatíveis já registradas no SkillRegistry.
 * - Não expõe conteúdo bruto de memória privada nem prompts internos.
 * - Diferencia fatos observados de estimativas e nunca inventa porcentagens de confiança.
 */

import type { DifficultyMapItem } from "@/features/learning/errors/DifficultyMapEngine";
import type { ExplanationLevel, LongTermMemorySettings } from "@/features/learning/memory/types";
import type { KnowledgeScore, StudyPriority } from "@/features/learning/types";
import type { TeacherAction, TeacherLevel, TeacherMethod } from "@/features/teacher/types";
import type { StudyRecord } from "@/types/study-engine";
import type { SkillContextType, SkillTokenBudget, SkillToolName } from "../types";

export type AdaptiveActivityGoal =
  | "learn"
  | "review"
  | "exam_prep"
  | "practice"
  | "error_review"
  | "explain_selection"
  | "plan"
  | "audio"
  | "code"
  | "math";

export type AdaptiveSelectionMode =
  | "adaptive"
  | "hybrid_manual"
  | "manual_override"
  | "manual_disabled"
  | "safe_fallback";

export type AuthorizedSignalKind = "observed" | "estimated" | "explicit_preference";

export type AuthorizedSignalCategory =
  | "goal"
  | "manual_preference"
  | "memory_preference"
  | "knowledge_estimate"
  | "difficulty_map"
  | "error_history"
  | "observed_performance"
  | "review_schedule"
  | "study_context";

export interface AuthorizedSignalDescriptor {
  readonly category: AuthorizedSignalCategory;
  readonly kind: AuthorizedSignalKind;
  readonly label: string;
}

/**
 * Sinais estruturados e sanitizados derivados da memória de longo prazo
 * apenas quando o consentimento de memória está ativo.
 * Nunca transporta texto bruto de entradas privadas da memória.
 */
export interface AdaptiveMemorySignals {
  readonly preferredExplanationLevel?: ExplanationLevel;
  readonly hasDifficultyMemory?: boolean;
  readonly hasGoalMemory?: boolean;
  readonly hasPreferenceMemory?: boolean;
  readonly activeMemoryCount?: number;
}

export interface AdaptiveManualPreference {
  readonly level?: TeacherLevel;
  readonly method?: TeacherMethod;
  readonly skillId?: string;
  readonly action?: TeacherAction;
}

export interface AdaptiveObservedPerformance {
  readonly quizAttempts: number;
  readonly averageScore?: number;
  readonly totalStudyMinutes: number;
  readonly dueFlashcardsCount: number;
  readonly pendingErrorsCount: number;
}

export interface AdaptiveTokenBudgetCap {
  readonly input?: number;
  readonly output?: number;
}

export interface AdaptiveSelectionInput {
  readonly goal?: AdaptiveActivityGoal;
  readonly accountId?: string;
  readonly sessionId?: string;
  /** Quando false, desativa personalização e preserva seleção manual/legada. */
  readonly personalizationEnabled?: boolean;
  /** Consentimento explícito para consultar sinais derivados da memória. */
  readonly memoryEnabled?: boolean;
  readonly memorySettings?: Pick<
    LongTermMemorySettings,
    "enabled" | "explanationLevel" | "adaptivePersonalizationEnabled"
  >;
  readonly manualPreference?: AdaptiveManualPreference;
  readonly study?: Pick<StudyRecord, "studyId" | "title" | "subject" | "progress">;
  readonly knowledge?: KnowledgeScore;
  readonly difficultyItem?: DifficultyMapItem;
  readonly priority?: StudyPriority;
  readonly observedPerformance?: AdaptiveObservedPerformance;
  readonly memorySignals?: AdaptiveMemorySignals;
  /** Contextos autorizados no chamador (intersecção estrita com allowedContext da skill). */
  readonly availableContext?: readonly SkillContextType[];
  /** Teto opcional de orçamento de tokens (nunca eleva o tokenBudget da SkillSpec). */
  readonly maxTokenBudget?: AdaptiveTokenBudgetCap;
}

export interface AdaptiveManualAlternative {
  readonly skillId: string;
  readonly skillVersion: string;
  readonly level: TeacherLevel;
  readonly method: TeacherMethod;
  readonly description: string;
}

export interface AdaptiveRejectedCandidate {
  readonly skillId: string;
  readonly reason: string;
}

export interface AdaptiveContractConstraints {
  readonly allowedContext: readonly SkillContextType[];
  readonly allowedTools: readonly SkillToolName[];
  readonly tokenBudget: SkillTokenBudget;
  readonly autoExecuteSkill: false;
  readonly autoExecuteTools: false;
}

export interface AdaptiveSkillRecommendation {
  readonly skillId: string;
  readonly skillVersion: string;
  readonly skillObjective: string;
  readonly goal: AdaptiveActivityGoal;
  readonly suggestedLevel: TeacherLevel;
  readonly suggestedLevelLabel: string;
  readonly suggestedMethod: TeacherMethod;
  readonly suggestedMethodLabel: string;
  readonly mode: AdaptiveSelectionMode;
  readonly personalizationApplied: boolean;
  readonly insufficientEvidence: boolean;
  readonly reasons: readonly string[];
  readonly authorizedSignalsUsed: readonly AuthorizedSignalDescriptor[];
  readonly manualAlternative: AdaptiveManualAlternative;
  readonly contractConstraints: AdaptiveContractConstraints;
  readonly rejectedCandidates: readonly AdaptiveRejectedCandidate[];
}
