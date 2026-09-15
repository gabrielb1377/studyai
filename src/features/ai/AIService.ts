import "server-only";

import { AIError } from "./AIErrors";
import type { AIProvider, AIProviderId, AIRequest } from "./AIProvider";
import { GeminiProvider } from "./providers/GeminiProvider";
import { OllamaProvider } from "./providers/OllamaProvider";
import { OpenRouterProvider } from "./providers/OpenRouterProvider";

const providers: Record<AIProviderId, AIProvider> = {
  gemini: GeminiProvider,
  ollama: OllamaProvider,
  openrouter: OpenRouterProvider,
};

export const AIService = {
  getProvider(providerId: AIProviderId = "gemini") {
    return providers[providerId];
  },

  generate(request: AIRequest & { provider?: AIProviderId }) {
    const provider = this.getProvider(request.provider);
    if (!provider) {
      throw new AIError("Provider de IA inválido.", "PROVIDER_UNAVAILABLE", 400, request.provider);
    }
    return provider.generate(request);
  },
};
