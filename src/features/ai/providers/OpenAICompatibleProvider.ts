import "server-only";

import { AIError } from "../AIErrors";
import type { AIModel, AIProvider, AIProviderId, AIProviderStatus, AIResponse } from "../AIProvider";

type ModelsResponse = { data?: Array<{ id?: string; created?: number }> };
type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
  model?: string;
};

export function createOpenAICompatibleProvider({
  id,
  name,
  baseUrl,
  apiKey,
}: {
  id: Extract<AIProviderId, "openrouter" | "groq">;
  name: string;
  baseUrl: string;
  apiKey: () => string | undefined;
}): AIProvider {
  const endpoint = baseUrl.replace(/\/+$/, "");
  const headers = (key: string) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" });
  const listModels = async (key: string, signal?: AbortSignal): Promise<AIModel[]> => {
    const response = await fetch(`${endpoint}/models`, { headers: headers(key), cache: "no-store", signal });
    const data = await response.json().catch(() => null) as ModelsResponse | null;
    if (!response.ok) throw new Error(`Não foi possível consultar os modelos do ${name}.`);
    return (data?.data ?? []).flatMap((model) => model.id ? [{ name: model.id }] : []);
  };

  return {
    id,
    name,
    available: true,
    async inspect(signal): Promise<AIProviderStatus> {
      const key = apiKey()?.trim();
      if (!key) return { provider: id, available: false, latencyMs: 0, models: [], endpoint, error: `${id.toUpperCase()}_API_KEY não configurada.` };
      try {
        const models = await listModels(key, signal);
        return { provider: id, available: true, latencyMs: 0, models, endpoint };
      } catch (error) {
        return { provider: id, available: false, latencyMs: 0, models: [], endpoint, error: error instanceof Error ? error.message : `${name} indisponível.` };
      }
    },
    async generate({ history, message, model, signal }): Promise<AIResponse> {
      const key = apiKey()?.trim();
      if (!key) throw new AIError(`Configure ${id.toUpperCase()}_API_KEY em .env.local.`, "MISSING_API_KEY", 503, id);
      const selectedModel = model?.trim() || (await listModels(key, signal))[0]?.name;
      if (!selectedModel) throw new AIError(`Nenhum modelo disponível no ${name}.`, "PROVIDER_UNAVAILABLE", 503, id);
      try {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: "POST",
          headers: headers(key),
          body: JSON.stringify({ model: selectedModel, messages: [...history, { role: "user", content: message }] }),
          cache: "no-store",
          signal,
        });
        const data = await response.json().catch(() => null) as ChatResponse | null;
        if (!response.ok) throw new AIError(data?.error?.message ?? `${name} não conseguiu responder.`, "PROVIDER_ERROR", response.status, id);
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) throw new AIError(`${name} retornou uma resposta vazia.`, "INVALID_RESPONSE", 502, id);
        return {
          provider: id,
          model: data?.model ?? selectedModel,
          text,
          usage: {
            inputTokens: data?.usage?.prompt_tokens,
            outputTokens: data?.usage?.completion_tokens,
            totalTokens: data?.usage?.total_tokens,
          },
        };
      } catch (error) {
        if (error instanceof AIError) throw error;
        throw new AIError(`Não foi possível conectar ao ${name}.`, "PROVIDER_ERROR", 502, id);
      }
    },
  };
}

