import type { AIProviderId } from "./AIProvider";

const STORAGE_KEY = "studyai:ai-settings";
const VERSION = 1;

export type AISettingsState = {
  version: typeof VERSION;
  provider: AIProviderId;
};

export const aiProviderOptions: ReadonlyArray<{
  id: AIProviderId;
  label: string;
  available: boolean;
}> = [
  { id: "gemini", label: "Gemini", available: true },
  { id: "ollama", label: "Ollama", available: false },
  { id: "openrouter", label: "OpenRouter", available: false },
];

const DEFAULT_SETTINGS: AISettingsState = { version: VERSION, provider: "gemini" };

function isSettings(value: unknown): value is AISettingsState {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<AISettingsState>;
  return settings.version === VERSION && aiProviderOptions.some(({ id }) => id === settings.provider);
}

export const AISettings = {
  load(): AISettingsState {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed: unknown = JSON.parse(raw);
      return isSettings(parsed) ? parsed : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  save(provider: AIProviderId) {
    const settings: AISettingsState = { version: VERSION, provider };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      window.dispatchEvent(new Event("studyai:ai-settings-updated"));
    }
    return settings;
  },
};
