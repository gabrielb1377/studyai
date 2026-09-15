import "server-only";

import { AIError } from "./AIErrors";
import type { AIProvider, AIProviderId, AIProviderStatus, AIRequest } from "./AIProvider";
import { GeminiProvider } from "./providers/GeminiProvider";
import { GroqProvider } from "./providers/GroqProvider";
import { OllamaProvider } from "./providers/OllamaProvider";
import { OpenRouterProvider } from "./providers/OpenRouterProvider";

const providers: Record<AIProviderId, AIProvider> = {
  gemini: GeminiProvider,
  ollama: OllamaProvider,
  openrouter: OpenRouterProvider,
  groq: GroqProvider,
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

  async inspect(providerId: AIProviderId, signal?: AbortSignal): Promise<AIProviderStatus> {
    const provider = this.getProvider(providerId);
    if (provider.inspect) return provider.inspect(signal);
    return {
      provider: provider.id,
      available: provider.available,
      latencyMs: 0,
      models: [],
      error: provider.available ? undefined : `O provider ${provider.name} ainda não está disponível.`,
    };
  },
};
