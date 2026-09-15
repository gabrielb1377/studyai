import "server-only";

import type { AIProvider, AIProviderId } from "./AIProvider";
import { GeminiProvider } from "./providers/GeminiProvider";
import { GroqProvider } from "./providers/GroqProvider";
import { OllamaProvider } from "./providers/OllamaProvider";
import { OpenRouterProvider } from "./providers/OpenRouterProvider";

const providers: Record<AIProviderId, AIProvider> = {
  gemini: GeminiProvider,
  ollama: OllamaProvider,
  groq: GroqProvider,
  openrouter: OpenRouterProvider,
};

export const ProviderRegistry = {
  get(providerId: AIProviderId) {
    return providers[providerId];
  },

  list() {
    return Object.values(providers);
  },
};
