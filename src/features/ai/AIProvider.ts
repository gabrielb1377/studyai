export const aiProviderIds = ["gemini", "ollama", "openrouter", "groq"] as const;

export type AIProviderId = (typeof aiProviderIds)[number];

export const aiSelectionModes = ["manual", "automatic"] as const;

export type AISelectionMode = (typeof aiSelectionModes)[number];

export type AIMessage = {
  role: "assistant" | "user";
  content: string;
};

export type AIRequest = {
  history: readonly AIMessage[];
  message: string;
  model?: string;
  signal?: AbortSignal;
  stream?: boolean;
};

export type AIResponse = {
  provider: AIProviderId;
  model: string;
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  execution?: {
    attemptedProviders: AIProviderId[];
    fallbackUsed: boolean;
    latencyMs: number;
  };
};

export type AIModel = {
  name: string;
  modifiedAt?: string;
  size?: number;
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
};

export type AIModelPreferences = Partial<Record<AIProviderId, string>>;

export type AIManagerRequest = AIRequest & {
  provider?: AIProviderId;
  mode?: AISelectionMode;
  models?: AIModelPreferences;
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
  inspect?(signal?: AbortSignal): Promise<AIProviderStatus>;
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
