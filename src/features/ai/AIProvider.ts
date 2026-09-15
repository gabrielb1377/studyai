export const aiProviderIds = ["gemini", "ollama", "openrouter", "groq"] as const;

export type AIProviderId = (typeof aiProviderIds)[number];

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
  error?: string;
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
