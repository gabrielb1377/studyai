import type { AIProviderId } from "./AIProvider";

export type AIErrorCode =
  | "INVALID_RESPONSE"
  | "MISSING_API_KEY"
  | "PROVIDER_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT";

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

export function normalizeAIError(error: unknown, fallbackMessage: string) {
  if (error instanceof AIError) {
    return {
      status: error.status,
      body: { code: error.code, error: error.message, provider: error.provider },
    };
  }

  return {
    status: 500,
    body: { code: "UNKNOWN_ERROR", error: fallbackMessage },
  };
}
