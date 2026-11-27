/**
 * StudyAI — Adaptive Learning (AL-1)
 * Seletor determinístico, explicável e desativável de skill, nível e método pedagógico.
 *
 * Regras de integridade:
 * - Zero chamadas de IA e zero execução automática de skills ou ferramentas.
 * - Reutiliza exclusivamente skills já registradas e válidas no SkillRegistry.
 * - Precedência explícita: opt-out de personalização > preferência manual explícita >
 *   evidências observadas + estimativas de conhecimento/dificuldade > fallback pedagógico seguro.
 * - Consentimento de memória obrigatório: quando desativada, sinais de memória são descartados.
 * - Textos vindos de materiais/estudos nunca são interpretados como diretrizes de política (PS-1b).
 */

import { isMemoryExpired, isMemoryStale } from "@/features/learning/memory/MemoryValidation";
import type { ExplanationLevel, LongTermMemoryStoreState } from "@/features/learning/memory/types";
import {
  defaultTeacherPreferences,
  teacherLevelLabels,
  teacherLevels,
  teacherMethodLabels,
  teacherMethods,
  type TeacherLevel,
  type TeacherMethod,
} from "@/features/teacher/types";
import { SkillRegistry, type SkillRegistryImpl } from "../SkillRegistry";
import type { SkillContextType, SkillSpec } from "../types";
import type {
  AdaptiveActivityGoal,
  AdaptiveMemorySignals,
  AdaptiveRejectedCandidate,
  AdaptiveSelectionInput,
  AdaptiveSelectionMode,
  AdaptiveSkillRecommendation,
  AuthorizedSignalDescriptor,
} from "./types";

const GOAL_LABELS: Record<AdaptiveActivityGoal, string> = {
  learn: "Aprender ou consolidar tema",
  review: "Revisão do conteúdo",
  exam_prep: "Preparação para prova",
  practice: "Prática com exercícios",
  error_review: "Revisão de erros pendentes",
  explain_selection: "Explicação de trecho selecionado",
  plan: "Planejamento de estudos",
  audio: "Estudo em áudio",
  code: "Prática de código e computação",
  math: "Resolução matemática passo a passo",
};

const SAFE_LEGACY_SKILL_ID = "teacher.dialogue";
const SAFE_FALLBACK_SKILL_ID = "teacher.guided_lesson";

const GOAL_REQUIRED_CONTEXT: Partial<Record<string, readonly SkillContextType[]>> = {
  "review.from-errors": ["errors"],
  "teacher.explain_selection": ["selection"],
};

function mapExplanationLevelToTeacherLevel(level?: ExplanationLevel): TeacherLevel | undefined {
  switch (level) {
    case "basic":
      return "beginner";
    case "intermediate":
      return "intermediate";
    case "advanced":
      return "advanced";
    case "technical":
      return "technical";
    default:
      return undefined;
  }
}

function isValidTeacherLevel(value: unknown): value is TeacherLevel {
  return typeof value === "string" && (teacherLevels as readonly string[]).includes(value);
}

function isValidTeacherMethod(value: unknown): value is TeacherMethod {
  return typeof value === "string" && (teacherMethods as readonly string[]).includes(value);
}

/**
 * Deriva sinais agregados e não sensíveis da memória de longo prazo.
 * Retorna `undefined` imediatamente se a memória estiver desativada.
 * Nunca expõe títulos ou textos brutos gravados pelo aluno.
 */
export function deriveSafeMemorySignals(
  state: LongTermMemoryStoreState | undefined,
  options: { studyId?: string; subject?: string; now?: Date } = {},
): AdaptiveMemorySignals | undefined {
  if (!state || !state.settings.enabled) {
    return undefined;
  }
  const now = options.now ?? new Date();
  const normalizedSubject = options.subject?.trim().toLowerCase();

  const relevant = state.entries.filter((entry) => {
    if (entry.sourceUnavailable || isMemoryExpired(entry, now) || isMemoryStale(entry, now)) {
      return false;
    }
    if (options.studyId && entry.studyId) {
      return entry.studyId === options.studyId;
    }
    if (normalizedSubject && entry.subject) {
      return entry.subject.trim().toLowerCase() === normalizedSubject;
    }
    return !entry.studyId;
  });

  return {
    preferredExplanationLevel: state.settings.explanationLevel,
    hasDifficultyMemory: relevant.some((entry) => entry.category === "difficulty"),
    hasGoalMemory: relevant.some((entry) => entry.category === "goal"),
    hasPreferenceMemory: relevant.some((entry) => entry.category === "preference"),
    activeMemoryCount: relevant.length,
  };
}

function checkSkillCompatibility(
  spec: SkillSpec,
  input: AdaptiveSelectionInput,
): { compatible: true; effectiveContext: readonly SkillContextType[] } | { compatible: false; reason: string } {
  if (input.maxTokenBudget?.input !== undefined) {
    const cap = input.maxTokenBudget.input;
    if (!Number.isFinite(cap) || cap <= 0 || spec.tokenBudget.input > cap) {
      return {
        compatible: false,
        reason: `Orçamento de entrada da skill (${spec.tokenBudget.input}) excede o limite autorizado (${cap}).`,
      };
    }
  }
  if (input.maxTokenBudget?.output !== undefined) {
    const cap = input.maxTokenBudget.output;
    if (!Number.isFinite(cap) || cap <= 0 || spec.tokenBudget.output > cap) {
      return {
        compatible: false,
        reason: `Orçamento de saída da skill (${spec.tokenBudget.output}) excede o limite autorizado (${cap}).`,
      };
    }
  }

  let effectiveContext: readonly SkillContextType[] = spec.allowedContext;
  if (input.availableContext) {
    const allowedSet = new Set(input.availableContext);
    effectiveContext = spec.allowedContext.filter((ctx) => allowedSet.has(ctx));
    const requiredForSkill = GOAL_REQUIRED_CONTEXT[spec.id] ?? [];
    for (const reqCtx of requiredForSkill) {
      if (!allowedSet.has(reqCtx)) {
        return {
          compatible: false,
          reason: `Contexto obrigatório "${reqCtx}" não está disponível/autorizado para esta skill.`,
        };
      }
    }
    if (spec.allowedContext.length > 0 && effectiveContext.length === 0) {
      return {
        compatible: false,
        reason: "Nenhum bloco de contexto autorizado pelo chamador é compatível com allowedContext da skill.",
      };
    }
  }

  return { compatible: true, effectiveContext };
}

function resolveFirstCompatibleSkill(
  candidateIds: readonly string[],
  input: AdaptiveSelectionInput,
  registry: SkillRegistryImpl,
  rejected: AdaptiveRejectedCandidate[],
): { spec: SkillSpec; effectiveContext: readonly SkillContextType[] } {
  const seen = new Set<string>();
  const ordered = [...candidateIds, SAFE_FALLBACK_SKILL_ID, SAFE_LEGACY_SKILL_ID];

  for (const rawId of ordered) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const spec = registry.get(id);
    if (!spec) {
      rejected.push({
        skillId: id,
        reason: "Skill não encontrada no SkillRegistry oficial.",
      });
      continue;
    }

    const compat = checkSkillCompatibility(spec, input);
    if (!compat.compatible) {
      rejected.push({ skillId: spec.id, reason: compat.reason });
      continue;
    }

    return { spec, effectiveContext: compat.effectiveContext };
  }

  // Último recurso determinístico: qualquer skill compatível registrada
  for (const spec of registry.list()) {
    if (seen.has(spec.id)) continue;
    const compat = checkSkillCompatibility(spec, input);
    if (compat.compatible) {
      return { spec, effectiveContext: compat.effectiveContext };
    }
  }

  throw new Error(
    "Nenhuma skill compatível registrada no SkillRegistry atende às restrições de contexto e orçamento.",
  );
}

function resolveFallbackAlternative(
  registry: SkillRegistryImpl,
  input: AdaptiveSelectionInput,
  preferredLevel: TeacherLevel,
  preferredMethod: TeacherMethod,
  description: string,
) {
  const fallbackSpec =
    registry.get(SAFE_FALLBACK_SKILL_ID) ??
    registry.get(SAFE_LEGACY_SKILL_ID) ??
    registry.list()[0];
  if (!fallbackSpec) {
    throw new Error("SkillRegistry vazio: impossível compor alternativa manual segura.");
  }
  const manualSkillId = input.manualPreference?.action
    ? `teacher.${input.manualPreference.action}`
    : undefined;
  const resolvedManual = manualSkillId ? registry.get(manualSkillId) : undefined;
  const spec = resolvedManual ?? fallbackSpec;
  return {
    skillId: spec.id,
    skillVersion: spec.version,
    level: preferredLevel,
    method: preferredMethod,
    description,
  };
}

/**
 * Seleciona de forma determinística, tipada e explicável a skill, o nível e o método pedagógico.
 * Não executa nenhuma chamada de IA nem aciona ferramentas.
 */
export function selectAdaptiveSkill(
  input: AdaptiveSelectionInput,
  registry: SkillRegistryImpl = SkillRegistry,
): AdaptiveSkillRecommendation {
  const goal: AdaptiveActivityGoal = input.goal ?? "learn";
  const rejectedCandidates: AdaptiveRejectedCandidate[] = [];
  const signals: AuthorizedSignalDescriptor[] = [
    { category: "goal", kind: "explicit_preference", label: `Objetivo: ${GOAL_LABELS[goal]}` },
  ];

  // 1. Verificar consentimento de personalização e memória (opt-out estrito)
  const personalizationEnabled =
    input.personalizationEnabled !== false &&
    input.memorySettings?.adaptivePersonalizationEnabled !== false;

  const memoryConsent =
    input.memoryEnabled === false || input.memorySettings?.enabled === false
      ? false
      : Boolean(input.memoryEnabled ?? input.memorySettings?.enabled ?? false);

  const manualLevel = isValidTeacherLevel(input.manualPreference?.level)
    ? input.manualPreference?.level
    : undefined;
  const manualMethod = isValidTeacherMethod(input.manualPreference?.method)
    ? input.manualPreference?.method
    : undefined;
  const manualSkillRequested =
    input.manualPreference?.skillId?.trim() ||
    (input.manualPreference?.action ? `teacher.${input.manualPreference.action}` : undefined);

  if (manualLevel || manualMethod || manualSkillRequested) {
    const parts: string[] = [];
    if (manualLevel) parts.push(`nível ${teacherLevelLabels[manualLevel]}`);
    if (manualMethod) parts.push(`método ${teacherMethodLabels[manualMethod]}`);
    if (manualSkillRequested) parts.push(`modo ${manualSkillRequested}`);
    signals.push({
      category: "manual_preference",
      kind: "explicit_preference",
      label: `Preferência manual do aluno (${parts.join(", ")})`,
    });
  }

  // Caso 1: Personalização desativada — preserva seleção manual e comportamento legado
  if (!personalizationEnabled) {
    const legacyCandidates = manualSkillRequested
      ? [manualSkillRequested, SAFE_LEGACY_SKILL_ID, SAFE_FALLBACK_SKILL_ID]
      : [SAFE_LEGACY_SKILL_ID, SAFE_FALLBACK_SKILL_ID];
    const { spec, effectiveContext } = resolveFirstCompatibleSkill(
      legacyCandidates,
      input,
      registry,
      rejectedCandidates,
    );
    const chosenLevel = manualLevel ?? defaultTeacherPreferences.level;
    const chosenMethod = manualMethod ?? defaultTeacherPreferences.method;
    const reasons: string[] = [
      "Personalização adaptativa desativada pelo aluno; preservada a seleção manual e o comportamento padrão.",
    ];
    if (rejectedCandidates.length > 0 && manualSkillRequested) {
      reasons.push(
        `A skill solicitada manualmente ("${manualSkillRequested}") não pôde ser aplicada e foi substituída pelo fallback padrão seguro.`,
      );
    }

    return {
      skillId: spec.id,
      skillVersion: spec.version,
      skillObjective: spec.objective,
      goal,
      suggestedLevel: chosenLevel,
      suggestedLevelLabel: teacherLevelLabels[chosenLevel],
      suggestedMethod: chosenMethod,
      suggestedMethodLabel: teacherMethodLabels[chosenMethod],
      mode: "manual_disabled",
      personalizationApplied: false,
      insufficientEvidence: false,
      reasons,
      authorizedSignalsUsed: signals,
      manualAlternative: resolveFallbackAlternative(
        registry,
        input,
        chosenLevel,
        chosenMethod,
        "Seleção manual ativa; você pode reativar a personalização adaptativa quando quiser.",
      ),
      contractConstraints: {
        allowedContext: effectiveContext,
        allowedTools: spec.allowedTools,
        tokenBudget: spec.tokenBudget,
        autoExecuteSkill: false,
        autoExecuteTools: false,
      },
      rejectedCandidates,
    };
  }

  // 2. Coletar somente sinais autorizados (nunca inventa métricas; respeita memoryConsent)
  const knowledge = input.knowledge ?? input.difficultyItem?.knowledge;
  const difficultyItem = input.difficultyItem;
  const observed = input.observedPerformance;

  const pendingErrorsCount =
    difficultyItem?.pendingErrorsCount ?? observed?.pendingErrorsCount ?? 0;
  const dueFlashcardsCount =
    difficultyItem?.dueFlashcardsCount ?? observed?.dueFlashcardsCount ?? 0;
  const quizAttempts =
    difficultyItem?.evolution.quizAttempts ?? observed?.quizAttempts ?? 0;
  const totalStudyMinutes = observed?.totalStudyMinutes ?? 0;
  const reviewStatus = difficultyItem?.reviewStatus;

  const hasObservedEvidence =
    pendingErrorsCount > 0 ||
    dueFlashcardsCount > 0 ||
    quizAttempts > 0 ||
    totalStudyMinutes > 0 ||
    (input.study?.progress ?? 0) > 0 ||
    reviewStatus === "late" ||
    reviewStatus === "today";

  const hasKnowledgeEvidence =
    Boolean(knowledge) && knowledge?.classification !== "never_studied";

  const hasDifficultyEvidence =
    Boolean(difficultyItem) && difficultyItem?.level !== "insufficient_data";

  const authorizedMemoryLevel = memoryConsent
    ? mapExplanationLevelToTeacherLevel(
        input.memorySignals?.preferredExplanationLevel ?? input.memorySettings?.explanationLevel,
      )
    : undefined;

  const authorizedHasDifficultyMemory = memoryConsent
    ? Boolean(input.memorySignals?.hasDifficultyMemory)
    : false;

  if (input.study) {
    signals.push({
      category: "study_context",
      kind: "observed",
      label:
        input.study.progress > 0
          ? `Contexto do estudo com progresso registrado (${Math.round(input.study.progress)}%)`
          : "Contexto do estudo selecionado",
    });
  }

  if (hasKnowledgeEvidence && knowledge) {
    signals.push({
      category: "knowledge_estimate",
      kind: "estimated",
      label: `Domínio estimado: ${knowledge.mastery} (${knowledge.knowledge}% estimado pelo histórico de atividades)`,
    });
  }

  if (hasDifficultyEvidence && difficultyItem) {
    const levelDesc =
      difficultyItem.level === "critical"
        ? "crítico"
        : difficultyItem.level === "attention"
          ? "em atenção"
          : "dominado";
    signals.push({
      category: "difficulty_map",
      kind: "estimated",
      label: `Mapa de dificuldades: estado ${levelDesc}`,
    });
  }

  if (pendingErrorsCount > 0) {
    signals.push({
      category: "error_history",
      kind: "observed",
      label: `${pendingErrorsCount} erro(s) pendente(s) observado(s) no Caderno de Erros`,
    });
  }

  if (dueFlashcardsCount > 0 || reviewStatus === "late" || reviewStatus === "today") {
    const revParts: string[] = [];
    if (reviewStatus === "late") revParts.push("revisão atrasada");
    else if (reviewStatus === "today") revParts.push("revisão para hoje");
    if (dueFlashcardsCount > 0) revParts.push(`${dueFlashcardsCount} flashcard(s) vencido(s)`);
    signals.push({
      category: "review_schedule",
      kind: "observed",
      label: `Agenda de revisão observada: ${revParts.join(" · ")}`,
    });
  }

  if (quizAttempts > 0 || totalStudyMinutes > 0) {
    const perfParts: string[] = [];
    if (quizAttempts > 0) {
      const avg = difficultyItem?.evolution.latestScore ?? observed?.averageScore;
      perfParts.push(
        avg !== undefined
          ? `${quizAttempts} avaliação(ões) observada(s) (último/média ${Math.round(avg)}%)`
          : `${quizAttempts} avaliação(ões) observada(s)`,
      );
    }
    if (totalStudyMinutes > 0) {
      perfParts.push(`${Math.round(totalStudyMinutes)} min de estudo registrados`);
    }
    signals.push({
      category: "observed_performance",
      kind: "observed",
      label: `Desempenho observado: ${perfParts.join(" · ")}`,
    });
  }

  if (memoryConsent && (authorizedMemoryLevel || authorizedHasDifficultyMemory || input.memorySignals?.hasGoalMemory || input.memorySignals?.hasPreferenceMemory)) {
    const memParts: string[] = [];
    if (authorizedMemoryLevel) {
      memParts.push(`nível preferido salvo (${teacherLevelLabels[authorizedMemoryLevel]})`);
    }
    if (authorizedHasDifficultyMemory) {
      memParts.push("sinal de dificuldade registrado em memória");
    }
    if (input.memorySignals?.hasGoalMemory) {
      memParts.push("objetivo salvo em memória");
    }
    if (input.memorySignals?.hasPreferenceMemory) {
      memParts.push("preferência de estudo ativa");
    }
    signals.push({
      category: "memory_preference",
      kind: "explicit_preference",
      label: `Memória autorizada (sem exposição de conteúdo): ${memParts.join(" · ")}`,
    });
  }

  const insufficientEvidence =
    !hasKnowledgeEvidence && !hasDifficultyEvidence && !hasObservedEvidence;

  // 3. Determinar sugestão adaptativa de skill, nível e método (determinística)
  let adaptiveCandidates: string[] = [];
  let adaptiveLevel: TeacherLevel = "intermediate";
  let adaptiveMethod: TeacherMethod = "step_by_step";
  const reasons: string[] = [];

  const isCriticalOrDifficult =
    difficultyItem?.level === "critical" ||
    knowledge?.classification === "difficult" ||
    pendingErrorsCount >= 2;
  const isForgottenOrLateReview =
    knowledge?.classification === "forgotten" ||
    reviewStatus === "late" ||
    reviewStatus === "today" ||
    dueFlashcardsCount > 0;
  const isMasteredOrAdvanced =
    !isCriticalOrDifficult &&
    (difficultyItem?.level === "mastered" ||
      knowledge?.classification === "strong" ||
      (knowledge?.mastery === "Avançado" && (knowledge?.knowledge ?? 0) >= 75));
  const isBeginnerProfile =
    !insufficientEvidence &&
    (knowledge?.mastery === "Iniciante" ||
      (knowledge !== undefined && knowledge.knowledge < 40));

  // Nível adaptativo base
  if (insufficientEvidence) {
    adaptiveLevel = authorizedMemoryLevel ?? (goal === "learn" ? "beginner" : "intermediate");
  } else if (isMasteredOrAdvanced) {
    adaptiveLevel = authorizedMemoryLevel === "technical" ? "technical" : "advanced";
  } else if (isCriticalOrDifficult || isBeginnerProfile) {
    adaptiveLevel = "beginner";
  } else {
    adaptiveLevel = authorizedMemoryLevel ?? "intermediate";
  }

  // Escolha determinística de skill e método por objetivo + evidências
  switch (goal) {
    case "exam_prep": {
      adaptiveCandidates = ["exam.preparation", "practice.adaptive", "teacher.exercise"];
      if (insufficientEvidence) {
        adaptiveMethod = "step_by_step";
        reasons.push(
          "Objetivo de preparação para prova sem histórico suficiente de desempenho; selecionado preparo estruturado passo a passo como fallback seguro.",
        );
      } else if (isMasteredOrAdvanced) {
        adaptiveMethod = "quick_review";
        reasons.push(
          "Objetivo de preparação para prova combinado com domínio estimado avançado; priorizada revisão rápida focada em pontos de prova.",
        );
      } else if (isCriticalOrDifficult) {
        adaptiveLevel = "beginner";
        adaptiveMethod = "step_by_step";
        reasons.push(
          "Objetivo de preparação para prova com dificuldades ou erros pendentes observados; selecionado reforço estruturado passo a passo.",
        );
      } else {
        adaptiveMethod = "practical_examples";
        reasons.push(
          "Objetivo de preparação para prova com domínio estimado intermediário; priorizada aplicação em questões e exemplos de prova.",
        );
      }
      break;
    }

    case "error_review": {
      adaptiveCandidates =
        pendingErrorsCount > 0
          ? ["review.from-errors", "gap.detection", "tutor.beginner"]
          : ["gap.detection", "tutor.beginner", SAFE_FALLBACK_SKILL_ID];
      adaptiveMethod = "step_by_step";
      if (pendingErrorsCount > 0) {
        reasons.push(
          `Foram observados ${pendingErrorsCount} erro(s) pendente(s) no Caderno de Erros; priorizada revisão direcionada a partir dos erros reais.`,
        );
      } else {
        reasons.push(
          "Objetivo de revisão de erros sem pendências registradas no Caderno de Erros; aplicada detecção diagnóstica de lacunas como fallback seguro.",
        );
      }
      break;
    }

    case "review": {
      if (reviewStatus === "late" || reviewStatus === "today" || dueFlashcardsCount > 0) {
        adaptiveCandidates = ["technique.spaced-repetition", "technique.active-recall", "teacher.adaptive_summary"];
        reasons.push(
          "Agenda de revisão observada indica itens vencidos ou programados; priorizada revisão espaçada.",
        );
      } else {
        adaptiveCandidates = ["technique.active-recall", "technique.spaced-repetition", "teacher.adaptive_summary"];
        reasons.push(
          insufficientEvidence
            ? "Objetivo de revisão sem histórico suficiente de retenção; aplicada recordação ativa como fallback seguro."
            : "Objetivo de revisão sem revisões atrasadas; priorizada recordação ativa para consolidar a memória.",
        );
      }
      if (isMasteredOrAdvanced) {
        adaptiveLevel = "brief";
        adaptiveMethod = "quick_review";
      } else if (knowledge?.classification === "forgotten" || isBeginnerProfile) {
        adaptiveLevel = "beginner";
        adaptiveMethod = "questions_and_answers";
      } else {
        adaptiveMethod = "quick_review";
      }
      break;
    }

    case "practice": {
      adaptiveCandidates = ["practice.adaptive", "technique.active-recall", "teacher.exercise"];
      adaptiveMethod = isCriticalOrDifficult || isBeginnerProfile ? "step_by_step" : "practical_examples";
      reasons.push(
        insufficientEvidence
          ? "Objetivo de prática sem avaliações anteriores registradas; iniciando com prática adaptativa gradual."
          : `Objetivo de prática adaptado ao domínio estimado (${knowledge?.mastery ?? "Intermediário"}) e ao histórico observado.`,
      );
      break;
    }

    case "math": {
      adaptiveCandidates = ["math.step-by-step", "practice.adaptive", SAFE_FALLBACK_SKILL_ID];
      adaptiveMethod = "step_by_step";
      reasons.push("Objetivo matemático identificado; selecionada resolução verificável passo a passo.");
      break;
    }

    case "code": {
      adaptiveCandidates = isMasteredOrAdvanced
        ? ["cs.algorithms", "code.teaching", SAFE_FALLBACK_SKILL_ID]
        : ["code.teaching", "cs.algorithms", SAFE_FALLBACK_SKILL_ID];
      adaptiveMethod = isMasteredOrAdvanced ? "socratic" : "practical_examples";
      reasons.push(
        isMasteredOrAdvanced
          ? "Objetivo de computação com domínio estimado avançado; priorizada análise algorítmica aprofundada."
          : "Objetivo de código/computação; priorizado ensino prático guiado de código.",
      );
      break;
    }

    case "audio": {
      adaptiveCandidates = ["audio.learning", "teacher.audio_lesson", SAFE_FALLBACK_SKILL_ID];
      adaptiveMethod = "step_by_step";
      reasons.push("Objetivo de estudo em áudio; selecionada trilha adaptada para narração clara.");
      break;
    }

    case "plan": {
      adaptiveCandidates = ["plan.study", "teacher.lesson_plan", SAFE_FALLBACK_SKILL_ID];
      adaptiveMethod = "step_by_step";
      reasons.push("Objetivo de planejamento; selecionado plano estruturado de estudo.");
      break;
    }

    case "explain_selection": {
      adaptiveCandidates = ["teacher.explain_selection", "doc.analysis", SAFE_FALLBACK_SKILL_ID];
      adaptiveMethod = isBeginnerProfile || isCriticalOrDifficult ? "analogies" : "step_by_step";
      reasons.push("Objetivo de explicação de trecho selecionado; priorizada ancoragem direta no trecho.");
      break;
    }

    case "learn":
    default: {
      if (insufficientEvidence) {
        adaptiveCandidates = ["tutor.beginner", SAFE_FALLBACK_SKILL_ID, SAFE_LEGACY_SKILL_ID];
        adaptiveMethod = "step_by_step";
        reasons.push(
          "Histórico insuficiente para personalização completa (nenhuma atividade, avaliação ou erro registrado); aplicado fallback pedagógico seguro passo a passo.",
        );
      } else if (pendingErrorsCount >= 2) {
        adaptiveCandidates = ["review.from-errors", "gap.detection", "tutor.beginner"];
        adaptiveLevel = isMasteredOrAdvanced ? "intermediate" : "beginner";
        adaptiveMethod = "step_by_step";
        reasons.push(
          `Foram observados ${pendingErrorsCount} erros pendentes neste tema; priorizada revisão orientada pelos erros antes de avançar.`,
        );
      } else if (isForgottenOrLateReview && !isCriticalOrDifficult) {
        adaptiveCandidates = ["technique.spaced-repetition", "technique.active-recall", SAFE_FALLBACK_SKILL_ID];
        adaptiveMethod = "quick_review";
        reasons.push(
          "Sinais observados de revisão pendente ou risco estimado de esquecimento; recomendada retomada por revisão espaçada.",
        );
      } else if (isCriticalOrDifficult || authorizedHasDifficultyMemory) {
        adaptiveCandidates =
          pendingErrorsCount > 0
            ? ["review.from-errors", "examples.analogies", "tutor.beginner"]
            : ["examples.analogies", "tutor.beginner", SAFE_FALLBACK_SKILL_ID];
        adaptiveLevel = "beginner";
        adaptiveMethod = "analogies";
        reasons.push(
          pendingErrorsCount > 0
            ? "Dificuldade identificada junto a erro pendente observado; priorizada consolidação guiada sobre os pontos de erro."
            : "Dificuldade identificada no mapa/perfil estimado; recomendadas analogias e exemplos concretos em nível iniciante.",
        );
      } else if (isMasteredOrAdvanced) {
        adaptiveCandidates = ["technique.socratic", "technique.active-recall", SAFE_FALLBACK_SKILL_ID];
        adaptiveMethod = "socratic";
        reasons.push(
          "Domínio estimado avançado sem pendências críticas observadas; selecionado método socrático para aprofundamento e síntese.",
        );
      } else if (isBeginnerProfile) {
        adaptiveCandidates = ["tutor.beginner", "examples.analogies", SAFE_FALLBACK_SKILL_ID];
        adaptiveMethod = "step_by_step";
        reasons.push(
          "Domínio estimado iniciante no tema; priorizada explicação fundamentada passo a passo em linguagem acessível.",
        );
      } else {
        adaptiveCandidates = ["technique.feynman", "technique.active-recall", SAFE_FALLBACK_SKILL_ID];
        adaptiveMethod = "practical_examples";
        reasons.push(
          "Domínio estimado intermediário em desenvolvimento; selecionada técnica Feynman com exemplos práticos para consolidar conceitos.",
        );
      }
      break;
    }
  }

  if (memoryConsent && authorizedMemoryLevel && !manualLevel) {
    if (authorizedMemoryLevel !== adaptiveLevel && !isCriticalOrDifficult) {
      adaptiveLevel = authorizedMemoryLevel;
      reasons.push(
        `Nível ajustado para ${teacherLevelLabels[authorizedMemoryLevel]} conforme preferência salva na memória autorizada.`,
      );
    }
  } else if (!memoryConsent && (input.memorySignals || input.memorySettings?.explanationLevel)) {
    reasons.push(
      "Memória desativada pelo aluno; nenhum dado ou preferência da memória foi utilizado na recomendação.",
    );
  }

  // 4. Aplicar precedência explícita de preferência manual (sem substituir silenciosamente)
  const effectiveLevel = manualLevel ?? adaptiveLevel;
  const effectiveMethod = manualMethod ?? adaptiveMethod;

  const candidateQueue = manualSkillRequested
    ? [manualSkillRequested, ...adaptiveCandidates]
    : adaptiveCandidates;

  const { spec, effectiveContext } = resolveFirstCompatibleSkill(
    candidateQueue,
    input,
    registry,
    rejectedCandidates,
  );

  const manualSkillAccepted = Boolean(manualSkillRequested && spec.id === manualSkillRequested);
  if (manualSkillRequested && !manualSkillAccepted) {
    reasons.push(
      `A skill solicitada manualmente ("${manualSkillRequested}") foi recusada por não existir no catálogo oficial ou por incompatibilidade de contexto/orçamento; aplicado fallback seguro compatível.`,
    );
  }

  if (manualLevel || manualMethod || manualSkillAccepted) {
    const manualDesc: string[] = [];
    if (manualSkillAccepted) manualDesc.push(`skill ${spec.id}`);
    if (manualLevel) manualDesc.push(`nível ${teacherLevelLabels[manualLevel]}`);
    if (manualMethod) manualDesc.push(`método ${teacherMethodLabels[manualMethod]}`);
    reasons.unshift(
      `Preferência manual do aluno preservada (${manualDesc.join(", ")}); escolhas manuais nunca são substituídas silenciosamente.`,
    );
  }

  let mode: AdaptiveSelectionMode;
  if (manualLevel && manualMethod && (!manualSkillRequested || manualSkillAccepted)) {
    mode = "manual_override";
  } else if (manualLevel || manualMethod || manualSkillAccepted) {
    mode = "hybrid_manual";
  } else if (insufficientEvidence) {
    mode = "safe_fallback";
  } else {
    mode = "adaptive";
  }

  const manualAlternative = resolveFallbackAlternative(
    registry,
    input,
    defaultTeacherPreferences.level,
    defaultTeacherPreferences.method,
    `Você pode alternar manualmente para ${teacherLevelLabels[defaultTeacherPreferences.level]} / ${teacherMethodLabels[defaultTeacherPreferences.method]} ou desativar a personalização adaptativa a qualquer momento.`,
  );

  return {
    skillId: spec.id,
    skillVersion: spec.version,
    skillObjective: spec.objective,
    goal,
    suggestedLevel: effectiveLevel,
    suggestedLevelLabel: teacherLevelLabels[effectiveLevel],
    suggestedMethod: effectiveMethod,
    suggestedMethodLabel: teacherMethodLabels[effectiveMethod],
    mode,
    personalizationApplied: mode !== "manual_override",
    insufficientEvidence,
    reasons,
    authorizedSignalsUsed: signals,
    manualAlternative,
    contractConstraints: {
      allowedContext: effectiveContext,
      allowedTools: spec.allowedTools,
      tokenBudget: spec.tokenBudget,
      autoExecuteSkill: false,
      autoExecuteTools: false,
    },
    rejectedCandidates,
  };
}
