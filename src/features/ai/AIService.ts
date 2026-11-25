import "server-only";

import type { AIManagerRequest, AIProviderId } from "./AIProvider";
import { ProviderManager } from "./ProviderManager";

export const AIService = {
  generate(request: AIManagerRequest) {
    return ProviderManager.generate(request);
  },

  stream(request: AIManagerRequest) {
    return ProviderManager.stream(request);
  },

  inspect(providerId: AIProviderId, options?: { force?: boolean; signal?: AbortSignal; apiKey?: string }) {
    return ProviderManager.inspect(providerId, options);
  },

  status(options?: { force?: boolean; signal?: AbortSignal; apiKeys?: Partial<Record<AIProviderId, string>> }) {
    return ProviderManager.status(options);
  },
};
