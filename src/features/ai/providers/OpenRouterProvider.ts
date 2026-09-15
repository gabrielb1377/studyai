import "server-only";

import { AIError } from "../AIErrors";
import type { AIProvider } from "../AIProvider";

export const OpenRouterProvider: AIProvider = {
  id: "openrouter",
  name: "OpenRouter",
  available: false,
  async generate() {
    throw new AIError("O provider OpenRouter ainda não está disponível.", "PROVIDER_UNAVAILABLE", 503, this.id);
  },
};
