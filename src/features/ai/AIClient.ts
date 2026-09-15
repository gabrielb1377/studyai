import { AISettings } from "./AISettings";

type AIErrorResponse = { error?: string };

export const AIClient = {
  async request<T>(endpoint: string, payload: Record<string, unknown>, fallbackMessage: string) {
    const settings = AISettings.load();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        provider: settings.provider,
        model: settings.models[settings.provider],
      }),
    });
    const data = await response.json().catch(() => null) as (T & AIErrorResponse) | null;
    if (!response.ok || !data) {
      throw new Error(data?.error ?? fallbackMessage);
    }
    return data;
  },
};
