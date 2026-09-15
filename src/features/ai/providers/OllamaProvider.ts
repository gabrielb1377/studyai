import "server-only";

import { AIError } from "../AIErrors";
import type { AIProvider } from "../AIProvider";

export const OllamaProvider: AIProvider = {
  id: "ollama",
  name: "Ollama",
  available: false,
  async generate() {
    throw new AIError("O provider Ollama ainda não está disponível.", "PROVIDER_UNAVAILABLE", 503, this.id);
  },
};
