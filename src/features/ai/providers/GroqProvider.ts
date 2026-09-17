import "server-only";

import { createOpenAICompatibleProvider } from "./OpenAICompatibleProvider";

export const GroqProvider = createOpenAICompatibleProvider({
  id: "groq",
  name: "Groq",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: () => process.env.GROQ_API_KEY,
});
