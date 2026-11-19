import type {
  AICapability,
  AIManagerRequest,
  AIModel,
  AIProviderId,
  AIRoutingDecision,
  AITaskCategory,
  AITaskDescription,
} from "./AIProvider";
import { TokenCounter } from "./TokenCounter";

const UNKNOWN_CONTEXT_WINDOW = 8_192;

const OUTPUT_LIMITS: Record<AITaskCategory, number> = {
  simple_conversation: 700,
  educational_explanation: 1_800,
  math_reasoning: 2_200,
  flashcard_generation: 1_200,
  question_generation: 2_000,
  correction_evaluation: 1_400,
  long_material_analysis: 2_600,
  multimodal_input: 1_600,
};

const PROVIDER_ORDER: readonly AIProviderId[] = ["ollama", "gemini", "groq", "openrouter"];
const MATH_PATTERN = /(?:\d\s*[+\-*/=^]|\b(?:equação|cálculo|calcule|matemát|derivad|integral|fração|álgebra)\b)/iu;

export type AIRoutingCandidate = {
  provider: AIProviderId;
  model: AIModel;
  available: boolean;
  capabilities: readonly AICapability[];
  credential: AIRoutingDecision["credential"];
  sharedQuota: "available" | "exhausted" | "unknown";
};

export type AIRoutingResult = {
  decision?: AIRoutingDecision;
  rejected: Array<{
    provider: AIProviderId;
    model: string;
    reason: "unavailable" | "capability" | "context" | "output" | "quota_unknown" | "quota_exhausted";
  }>;
};

function capabilitiesForTask(category: AITaskCategory): readonly AICapability[] {
  if (category === "multimodal_input") return ["text", "multimodal"];
  if (["flashcard_generation", "question_generation", "correction_evaluation"].includes(category)) {
    return ["text", "structured_text"];
  }
  return ["text"];
}

function credentialRank(credential: AIRoutingDecision["credential"]) {
  return credential === "local" ? 0 : credential === "byok" ? 1 : 2;
}

function providerRank(provider: AIProviderId) {
  const rank = PROVIDER_ORDER.indexOf(provider);
  return rank === -1 ? PROVIDER_ORDER.length : rank;
}

function rejectReason(candidate: AIRoutingCandidate, task: AITaskDescription): AIRoutingResult["rejected"][number]["reason"] | null {
  if (!candidate.available) return "unavailable";
  if (!task.requiredCapabilities.every((capability) => candidate.capabilities.includes(capability))) return "capability";
  const contextWindow = candidate.model.contextWindow ?? UNKNOWN_CONTEXT_WINDOW;
  if (task.estimatedInputTokens + task.maxOutputTokens > contextWindow) return "context";
  if (candidate.model.outputTokenLimit !== undefined && candidate.model.outputTokenLimit < task.maxOutputTokens) return "output";
  if (candidate.credential === "shared_quota" && candidate.sharedQuota === "unknown") return "quota_unknown";
  if (candidate.credential === "shared_quota" && candidate.sharedQuota === "exhausted") return "quota_exhausted";
  return null;
}

export const AIRouter = {
  describeTutorTask(input: {
    message: string;
    history: AIManagerRequest["history"];
    promptTokens: number;
    contextTokens: number;
  }): AITaskDescription {
    const category: AITaskCategory = input.contextTokens > 4_000
      ? "long_material_analysis"
      : MATH_PATTERN.test(input.message)
        ? "math_reasoning"
        : input.history.length === 0 && TokenCounter.estimate(input.message) <= 40
          ? "simple_conversation"
          : "educational_explanation";
    return {
      category,
      requiredCapabilities: capabilitiesForTask(category),
      estimatedInputTokens: Math.max(1, Math.ceil(input.promptTokens)),
      maxOutputTokens: OUTPUT_LIMITS[category],
    };
  },

  select(input: {
    mode?: AIManagerRequest["mode"];
    preferredProvider?: AIProviderId;
    preferredModel?: string;
    task: AITaskDescription;
    candidates: readonly AIRoutingCandidate[];
  }): AIRoutingResult {
    const preferredProvider = input.preferredProvider ?? "gemini";
    if (input.mode !== "automatic") {
      const credential = input.candidates.find((candidate) => candidate.provider === preferredProvider)?.credential ?? "shared_quota";
      return {
        decision: {
          provider: preferredProvider,
          model: input.preferredModel,
          selection: "manual",
          reason: "Escolha manual preservada.",
          estimatedInputTokens: input.task.estimatedInputTokens,
          maxOutputTokens: input.task.maxOutputTokens,
          credential,
        },
        rejected: [],
      };
    }

    const rejected: AIRoutingResult["rejected"] = [];
    const eligible = input.candidates.filter((candidate) => {
      const reason = rejectReason(candidate, input.task);
      if (reason) rejected.push({ provider: candidate.provider, model: candidate.model.name, reason });
      return reason === null;
    });
    eligible.sort((left, right) => {
      const byCredential = credentialRank(left.credential) - credentialRank(right.credential);
      if (byCredential !== 0) return byCredential;
      const byPreference = Number(right.provider === preferredProvider) - Number(left.provider === preferredProvider);
      if (byPreference !== 0) return byPreference;
      const leftPreferredModel = left.provider === preferredProvider && left.model.name === input.preferredModel;
      const rightPreferredModel = right.provider === preferredProvider && right.model.name === input.preferredModel;
      const byModelPreference = Number(rightPreferredModel) - Number(leftPreferredModel);
      if (byModelPreference !== 0) return byModelPreference;
      const byProvider = providerRank(left.provider) - providerRank(right.provider);
      return byProvider !== 0 ? byProvider : left.model.name.localeCompare(right.model.name);
    });

    const selected = eligible[0];
    if (!selected) return { rejected };
    const reason = selected.credential === "local"
      ? "Seleção automática: modelo local compatível e disponível."
      : selected.credential === "byok"
        ? "Seleção automática: modelo compatível usando a chave configurada pelo usuário."
        : "Seleção automática: modelo compatível dentro da quota compartilhada conhecida.";
    return {
      decision: {
        provider: selected.provider,
        model: selected.model.name,
        selection: "automatic",
        reason,
        estimatedInputTokens: input.task.estimatedInputTokens,
        maxOutputTokens: input.task.maxOutputTokens,
        credential: selected.credential,
      },
      rejected,
    };
  },
};
