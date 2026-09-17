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

  inspect(providerId: AIProviderId, options?: { force?: boolean; signal?: AbortSignal }) {
    return ProviderManager.inspect(providerId, options);
  },

  status(options?: { force?: boolean; signal?: AbortSignal }) {
    return ProviderManager.status(options);
  },
};
