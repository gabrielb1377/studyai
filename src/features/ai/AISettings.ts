import {
  isAIModelPreferences,
  isAIProviderId,
  isAISelectionMode,
  type AIModelPreferences,
  type AIProviderId,
  type AISelectionMode,
} from "./AIProvider";

const STORAGE_KEY = "studyai:ai-settings";
const VERSION = 3;

export type AISettingsState = {
  version: typeof VERSION;
  mode: AISelectionMode;
  provider: AIProviderId;
  models: AIModelPreferences;
};

export const aiProviderOptions: ReadonlyArray<{
  id: AIProviderId;
  label: string;
  available: boolean;
}> = [
  { id: "gemini", label: "Gemini", available: true },
  { id: "ollama", label: "Ollama", available: true },
  { id: "openrouter", label: "OpenRouter", available: false },
  { id: "groq", label: "Groq", available: false },
];

const DEFAULT_SETTINGS: AISettingsState = {
  version: VERSION,
  mode: "manual",
  provider: "gemini",
  models: {},
};

function isSettings(value: unknown): value is AISettingsState {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<AISettingsState>;
  return settings.version === VERSION && isAISelectionMode(settings.mode) &&
    isAIProviderId(settings.provider) && isAIModelPreferences(settings.models);
}

function migrateSettings(value: unknown): AISettingsState | null {
  if (!value || typeof value !== "object") return null;
  const settings = value as { mode?: unknown; provider?: unknown; models?: unknown };
  if (!isAIProviderId(settings.provider)) return null;
  const models = isAIModelPreferences(settings.models)
    ? settings.models
    : {};
  return {
    version: VERSION,
    mode: isAISelectionMode(settings.mode) ? settings.mode : "manual",
    provider: settings.provider,
    models,
  };
}

function persist(settings: AISettingsState) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("studyai:ai-settings-updated"));
  }
  return settings;
}

export const AISettings = {
  load(): AISettingsState {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed: unknown = JSON.parse(raw);
      return isSettings(parsed) ? parsed : migrateSettings(parsed) ?? DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  save(provider: AIProviderId) {
    const current = this.load();
    return persist({ ...current, version: VERSION, provider });
  },

  saveMode(mode: AISelectionMode) {
    const current = this.load();
    return persist({ ...current, version: VERSION, mode });
  },

  saveModel(provider: AIProviderId, model: string) {
    const current = this.load();
    return persist({
      ...current,
      version: VERSION,
      models: { ...current.models, [provider]: model.trim() },
    });
  },
};
