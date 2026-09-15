export const aiProviderIds = ["gemini", "ollama", "openrouter"] as const;

export type AIProviderId = (typeof aiProviderIds)[number];

export type AIMessage = {
  role: "assistant" | "user";
  content: string;
};

export type AIRequest = {
  history: readonly AIMessage[];
  message: string;
  signal?: AbortSignal;
};

export type AIResponse = {
  provider: AIProviderId;
  model: string;
  text: string;
};

export interface AIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  readonly available: boolean;
  generate(request: AIRequest): Promise<AIResponse>;
}

export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === "string" && aiProviderIds.includes(value as AIProviderId);
}
