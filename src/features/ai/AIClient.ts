import { AISettings } from "./AISettings";

type AIErrorResponse = { error?: string };

export const AIClient = {
  async request<T>(endpoint: string, payload: Record<string, unknown>, fallbackMessage: string) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, provider: AISettings.load().provider }),
    });
    const data = await response.json().catch(() => null) as (T & AIErrorResponse) | null;
    if (!response.ok || !data) {
      throw new Error(data?.error ?? fallbackMessage);
    }
    return data;
  },
};
