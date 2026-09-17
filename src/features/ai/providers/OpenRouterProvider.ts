import "server-only";

import { createOpenAICompatibleProvider } from "./OpenAICompatibleProvider";

export const OpenRouterProvider = createOpenAICompatibleProvider({
  id: "openrouter",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: () => process.env.OPENROUTER_API_KEY,
});
