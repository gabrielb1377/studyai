export const aiProviderIds = ["gemini", "ollama", "openrouter", "groq"] as const;

export type AIProviderId = (typeof aiProviderIds)[number];

export const aiSelectionModes = ["manual", "automatic"] as const;

export type AISelectionMode = (typeof aiSelectionModes)[number];

export const aiTaskCategories = [
  "simple_conversation",
  "educational_explanation",
  "math_reasoning",
  "flashcard_generation",
  "question_generation",
  "correction_evaluation",
  "long_material_analysis",
  "multimodal_input",
] as const;

export type AITaskCategory = (typeof aiTaskCategories)[number];

export type AICapability = "text" | "structured_text" | "long_context" | "multimodal";

export type AITaskDescription = {
  category: AITaskCategory;
  requiredCapabilities: readonly AICapability[];
  estimatedInputTokens: number;
  maxOutputTokens: number;
};

export type AIRoutingDecision = {
  provider: AIProviderId;
  model?: string;
  selection: "manual" | "automatic";
  reason: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  credential: "local" | "byok" | "shared_quota";
};

export type AIMessage = {
  role: "assistant" | "user";
  content: string;
};

export type AIUsageSource = "provider" | "estimated" | "unknown";

export type AIUsageSettlement = {
  outcome: "completed" | "cached" | "failed" | "cancelled";
  provider: AIProviderId;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    source?: AIUsageSource;
  };
  emittedOutput?: boolean;
  emittedText?: string;
  providerContacted?: boolean;
};

export type AIRequest = {
  history: readonly AIMessage[];
  message: string;
  /** Instruções fixas de sistema enviadas no canal nativo `system` do provedor (resolvidas no servidor). */
  systemPrompt?: string;
  model?: string;
  signal?: AbortSignal;
  stream?: boolean;
  maxOutputTokens?: number;
  timeoutMs?: number;
  apiKey?: string;
  /** Quando true, o provedor nunca recorre à chave compartilhada do servidor. */
  strictByok?: boolean;
};

export type AIResponse = {
  provider: AIProviderId;
  model: string;
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    source?: AIUsageSource;
    contextTokens?: number;
    historyTokens?: number;
    chunkTokens?: number;
  };
  execution?: {
    attemptedProviders: AIProviderId[];
    fallbackUsed: boolean;
    latencyMs: number;
    cached?: boolean;
    routing?: AIRoutingDecision;
  };
};

export type AIStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; response: AIResponse };

export type AIModel = {
  name: string;
  modifiedAt?: string;
  size?: number;
  contextWindow?: number;
  outputTokenLimit?: number;
};

export type AIProviderStatus = {
  provider: AIProviderId;
  available: boolean;
  latencyMs: number;
  version?: string;
  models: AIModel[];
  checkedAt?: string;
  memoryBytes?: number;
  error?: string;
  endpoint?: string;
  averageResponseTimeMs?: number;
  lastError?: string;
};

export type AIModelPreferences = Partial<Record<AIProviderId, string>>;

export type AIFallbackCost = "local" | "byok" | "shared_quota";

export type AIFallbackAlternative = {
  provider: AIProviderId;
  model: string;
  cost: AIFallbackCost;
  notice: string;
};

export type AIFallbackConsent = {
  requestId: string;
  originalProvider: AIProviderId;
  provider: AIProviderId;
  model: string;
};

export type AIFallbackOffer = {
  requestId: string;
  primaryProvider: AIProviderId;
  primaryModel?: string;
  alternatives: AIFallbackAlternative[];
};

export type AISkillIdentity = {
  readonly id: string;
  readonly version: string;
  readonly maxInputTokens?: number;
  readonly maxOutputTokens?: number;
};

export type AIManagerRequest = AIRequest & {
  provider?: AIProviderId;
  mode?: AISelectionMode;
  models?: AIModelPreferences;
  apiKeys?: Partial<Record<AIProviderId, string>>;
  requestId?: string;
  requestOwner?: string;
  credentialOrigin?: "shared" | "byok" | "local";
  emailVerified?: boolean;
  onSettlement?: (settlement: AIUsageSettlement) => Promise<void> | void;
  /** Identidade e orçamento da skill resolvidos exclusivamente no servidor via SkillRegistry. */
  skill?: AISkillIdentity;
  /** Predicado server-side opcional: quando retorna false, impede gravação de saída inválida no AIResponseCache. */
  validateResponse?: (text: string) => boolean;
  fallbackPolicy?: "consent";
  fallbackConsent?: AIFallbackConsent;
  task?: AITaskDescription;
  routingPolicy?: "smart";
  routingDecision?: AIRoutingDecision;
};

export type AIProviderLog = {
  id: string;
  provider: AIProviderId;
  model?: string;
  timestamp: string;
  latencyMs: number;
  success: boolean;
  fallback: boolean;
  tokens?: number;
  error?: string;
};

export type AIProviderStatistics = {
  messages: number;
  tokens?: number;
  averageResponseTimeMs: number;
  failures: number;
  fallbacks: number;
};

export type AIManagerStatus = {
  providers: AIProviderStatus[];
  statistics: AIProviderStatistics;
  logs: AIProviderLog[];
};

export interface AIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  readonly available: boolean;
  generate(request: AIRequest): Promise<AIResponse>;
  stream?(request: AIRequest): AsyncGenerator<AIStreamEvent>;
  inspect?(signal?: AbortSignal, apiKey?: string): Promise<AIProviderStatus>;
}

export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === "string" && aiProviderIds.includes(value as AIProviderId);
}

export function isAISelectionMode(value: unknown): value is AISelectionMode {
  return typeof value === "string" && aiSelectionModes.includes(value as AISelectionMode);
}

export function isAIModelPreferences(value: unknown): value is AIModelPreferences {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([provider, model]) =>
    isAIProviderId(provider) && typeof model === "string" && model.trim().length > 0,
  );
}
