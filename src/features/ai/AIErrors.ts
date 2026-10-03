import type { AIProviderId } from "./AIProvider";

export type AIErrorCode =
  | "INVALID_RESPONSE"
  | "MISSING_API_KEY"
  | "PROVIDER_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMIT"
  | "TIMEOUT";

export const AI_RATE_LIMIT_MESSAGE =
  "Limite temporário da IA atingido. Tente novamente em alguns minutos ou troque o provedor de IA.";

export class AIError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCode,
    public readonly status: number,
    public readonly provider?: AIProviderId,
  ) {
    super(message);
    this.name = "AIError";
  }
}

function suggestionFor(error: AIError) {
  if (error.code === "MISSING_API_KEY") {
    return "Abra Configurações > IA, configure o provider e reinicie o servidor após alterar o arquivo .env.local.";
  }
  if (error.code === "TIMEOUT") {
    return "Tente novamente. Para modelos locais, confirme se o Ollama está ativo e se o modelo terminou de carregar.";
  }
  if (error.code === "INVALID_RESPONSE") {
    return "Tente gerar novamente ou selecione outro modelo nas configurações de IA.";
  }
  if (error.code === "PROVIDER_UNAVAILABLE") {
    return "Teste a conexão em Configurações > IA ou selecione outro provider disponível.";
  }
  if (error.status === 429 || /high demand|overload|resource exhausted/i.test(error.message)) {
    return "Aguarde alguns instantes e tente novamente; o limite temporário do provider foi atingido.";
  }
  return "Teste a conexão do provider em Configurações > IA e tente novamente.";
}

export function isAIRateLimitError(error: unknown) {
  return error instanceof AIError && (
    error.code === "RATE_LIMIT" ||
    error.status === 429 ||
    /high demand|overload|resource exhausted|rate.?limit/i.test(error.message)
  );
}

export function safeAIErrorLogMessage(error: unknown) {
  if (!(error instanceof AIError)) return "UNKNOWN_ERROR";
  return [error.code, error.status, error.provider ?? "unknown"].join(":");
}

export function normalizeAIError(error: unknown, fallbackMessage: string) {
  if (error instanceof AIError) {
    const rateLimited = isAIRateLimitError(error);
    return {
      status: rateLimited ? 429 : error.status,
      body: {
        code: rateLimited ? "RATE_LIMIT" : error.code,
        error: rateLimited
          ? AI_RATE_LIMIT_MESSAGE
          : error.code === "MISSING_API_KEY"
          ? "Configure um provedor de IA antes de gerar conteúdo."
          : error.message,
        provider: error.provider,
        suggestion: rateLimited ? AI_RATE_LIMIT_MESSAGE : suggestionFor(error),
      },
    };
  }

  return {
    status: 500,
    body: { code: "UNKNOWN_ERROR", error: fallbackMessage },
  };
}
