import "server-only";

import { AIError } from "../AIErrors";
import type { AIProvider } from "../AIProvider";

export const GroqProvider: AIProvider = {
  id: "groq",
  name: "Groq",
  available: false,
  async generate() {
    throw new AIError("O provider Groq ainda não está disponível.", "PROVIDER_UNAVAILABLE", 503, this.id);
  },
};
