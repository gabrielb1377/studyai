import "server-only";

import { AIError } from "../AIErrors";
import type { AIMessage, AIModel, AIProvider, AIProviderId, AIProviderStatus, AIResponse, AIStreamEvent } from "../AIProvider";
import { TokenCounter } from "../TokenCounter";

type ModelsResponse = { data?: Array<{ id?: string; created?: number; context_length?: number }> };
type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
  model?: string;
};

type ChatStreamResponse = {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: ChatResponse["usage"];
  model?: string;
  error?: { message?: string };
};

function boundedMessages(history: readonly AIMessage[], message: string, contextWindow: number) {
  const outputReserve = Math.min(2_048, Math.max(512, Math.floor(contextWindow * 0.2)));
  const inputBudget = Math.max(512, contextWindow - outputReserve);
  const boundedMessage = TokenCounter.truncate(message, Math.max(256, inputBudget - 32));
  let used = TokenCounter.estimate(boundedMessage) + 4;
  const boundedHistory: AIMessage[] = [];
  for (const item of [...history].reverse()) {
    const tokens = TokenCounter.estimate(item.content) + 4;
    if (used + tokens > inputBudget) continue;
    boundedHistory.unshift(item);
    used += tokens;
  }
  return { messages: [...boundedHistory, { role: "user" as const, content: boundedMessage }], maxTokens: outputReserve };
}

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
    return (data?.data ?? []).flatMap((model) => model.id ? [{ name: model.id, contextWindow: model.context_length }] : []);
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
      const models = await listModels(key, signal);
      const selectedModel = model?.trim() || models[0]?.name;
      if (!selectedModel) throw new AIError(`Nenhum modelo disponível no ${name}.`, "PROVIDER_UNAVAILABLE", 503, id);
      const modelInfo = models.find((item) => item.name === selectedModel);
      const bounded = boundedMessages(history, message, modelInfo?.contextWindow ?? 16_384);
      try {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: "POST",
          headers: headers(key),
          body: JSON.stringify({ model: selectedModel, messages: bounded.messages, max_tokens: bounded.maxTokens }),
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
    async *stream({ history, message, model, signal }): AsyncGenerator<AIStreamEvent> {
      const key = apiKey()?.trim();
      if (!key) throw new AIError(`Configure ${id.toUpperCase()}_API_KEY em .env.local.`, "MISSING_API_KEY", 503, id);
      const models = await listModels(key, signal);
      const selectedModel = model?.trim() || models[0]?.name;
      if (!selectedModel) throw new AIError(`Nenhum modelo disponível no ${name}.`, "PROVIDER_UNAVAILABLE", 503, id);
      const modelInfo = models.find((item) => item.name === selectedModel);
      const bounded = boundedMessages(history, message, modelInfo?.contextWindow ?? 16_384);
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: headers(key),
        body: JSON.stringify({ model: selectedModel, messages: bounded.messages, max_tokens: bounded.maxTokens, stream: true, stream_options: { include_usage: true } }),
        cache: "no-store",
        signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null) as ChatResponse | null;
        throw new AIError(data?.error?.message ?? `${name} não conseguiu iniciar o streaming.`, "PROVIDER_ERROR", response.status || 502, id);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let usage: AIResponse["usage"];
      let responseModel = selectedModel;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          const data = JSON.parse(payload) as ChatStreamResponse;
          if (data.error?.message) throw new AIError(data.error.message, "PROVIDER_ERROR", 502, id);
          responseModel = data.model ?? responseModel;
          const delta = data.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            text += delta;
            yield { type: "delta", text: delta };
          }
          if (data.usage) {
            usage = {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            };
          }
        }
      }
      if (!text.trim()) throw new AIError(`${name} retornou uma resposta vazia.`, "INVALID_RESPONSE", 502, id);
      yield { type: "done", response: { provider: id, model: responseModel, text: text.trim(), usage } };
    },
  };
}
