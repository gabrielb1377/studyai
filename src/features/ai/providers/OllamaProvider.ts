import "server-only";

import { AIError } from "../AIErrors";
import type {
  AIMessage,
  AIModel,
  AIProvider,
  AIProviderStatus,
  AIResponse,
} from "../AIProvider";

const DEFAULT_BASE_URL = "http://localhost:11434";
const REQUEST_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 5_000;
const SYSTEM_MESSAGE = [
  "Você é o Tutor IA do StudyAI.",
  "Responda em português, de forma didática e objetiva.",
  "Use somente o contexto fornecido quando a solicitação depender dos materiais de estudo.",
].join(" ");

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    model?: string;
    modified_at?: string;
    size?: number;
  }>;
};

type OllamaChatChunk = {
  model?: string;
  message?: { content?: string };
  error?: string;
};

function getBaseUrl() {
  return (process.env.OLLAMA_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function withTimeout(signal: AbortSignal | undefined, duration: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), duration);
  return {
    signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function normalizeModels(data: OllamaTagsResponse | null): AIModel[] {
  if (!Array.isArray(data?.models)) return [];
  return data.models.flatMap((model) => {
    const name = model.name?.trim() || model.model?.trim();
    return name ? [{ name, modifiedAt: model.modified_at, size: model.size }] : [];
  });
}

function toOllamaMessages(history: readonly AIMessage[], message: string) {
  return [
    { role: "system" as const, content: SYSTEM_MESSAGE },
    ...history
      .filter((item) => item.content.trim().length > 0)
      .map((item) => ({ role: item.role, content: item.content.trim() })),
    { role: "user" as const, content: message.trim() },
  ];
}

async function readStream(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  const consume = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as OllamaChatChunk;
    if (chunk.error) throw new Error(chunk.error);
    text += chunk.message?.content ?? "";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
  }
  buffer += decoder.decode();
  consume(buffer);
  return text.trim();
}

async function listModels(signal?: AbortSignal): Promise<AIModel[]> {
  const response = await fetch(`${getBaseUrl()}/api/tags`, {
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => null) as OllamaTagsResponse | null;
  if (!response.ok) throw new Error("Não foi possível listar os modelos do Ollama.");
  return normalizeModels(data);
}

export const OllamaProvider: AIProvider = {
  id: "ollama",
  name: "Ollama",
  available: true,

  async inspect(signal): Promise<AIProviderStatus> {
    const startedAt = performance.now();
    const request = withTimeout(signal, HEALTH_TIMEOUT_MS);
    try {
      const [versionResponse, models] = await Promise.all([
        fetch(`${getBaseUrl()}/api/version`, { cache: "no-store", signal: request.signal }),
        listModels(request.signal),
      ]);
      const versionData = await versionResponse.json().catch(() => null) as { version?: string } | null;
      if (!versionResponse.ok) throw new Error("Não foi possível consultar a versão do Ollama.");
      return {
        provider: this.id,
        available: true,
        latencyMs: Math.round(performance.now() - startedAt),
        version: versionData?.version,
        models,
      };
    } catch {
      return {
        provider: this.id,
        available: false,
        latencyMs: Math.round(performance.now() - startedAt),
        models: [],
        error: "Ollama indisponível",
      };
    } finally {
      request.clear();
    }
  },

  async generate({ history, message, model, signal, stream = false }): Promise<AIResponse> {
    const request = withTimeout(signal, REQUEST_TIMEOUT_MS);
    try {
      const selectedModel = model?.trim() || (await listModels(request.signal))[0]?.name;
      if (!selectedModel) {
        throw new AIError(
          "Nenhum modelo está instalado no Ollama. Instale um modelo antes de continuar.",
          "PROVIDER_UNAVAILABLE",
          503,
          this.id,
        );
      }

      const response = await fetch(`${getBaseUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: toOllamaMessages(history, message),
          stream,
        }),
        cache: "no-store",
        signal: request.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as OllamaChatChunk | null;
        throw new AIError(
          data?.error ?? "O Ollama não conseguiu responder agora.",
          "PROVIDER_ERROR",
          response.status >= 400 && response.status < 600 ? response.status : 502,
          this.id,
        );
      }

      const data = stream
        ? { message: { content: await readStream(response) } }
        : await response.json().catch(() => null) as OllamaChatChunk | null;
      const text = data?.message?.content?.trim();
      if (!text) {
        throw new AIError("O Ollama retornou uma resposta vazia.", "INVALID_RESPONSE", 502, this.id);
      }
      return { provider: this.id, model: selectedModel, text };
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (request.signal.aborted) {
        throw new AIError("O Ollama demorou demais para responder.", "TIMEOUT", 504, this.id);
      }
      throw new AIError(
        `Ollama indisponível. Verifique se o serviço está ativo em ${getBaseUrl()}.`,
        "PROVIDER_UNAVAILABLE",
        503,
        this.id,
      );
    } finally {
      request.clear();
    }
  },
};
