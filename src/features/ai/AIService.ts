import "server-only";

import type { AIManagerRequest, AIProviderId } from "./AIProvider";
import { ProviderManager } from "./ProviderManager";

export const AIService = {
  generate(request: AIManagerRequest) {
    return ProviderManager.generate(request);
  },

  inspect(providerId: AIProviderId, signal?: AbortSignal) {
    return ProviderManager.inspect(providerId, signal);
  },

  status(options?: { force?: boolean; signal?: AbortSignal }) {
    return ProviderManager.status(options);
  },
};
