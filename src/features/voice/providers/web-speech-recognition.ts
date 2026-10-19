import type {
  SpeechRecognitionProviderId,
  SpeechRecognitionPreferences,
  SpeechRecognitionResult,
  SpeechRecognitionError,
  SpeechRecognitionService,
} from "../types";

export const webSpeechRecognitionProvider: SpeechRecognitionService = {
  init: async () => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    const SpeechRecognition =
      globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return {
        supported: false,
        provider: "web-speech",
        error: {
          code: "not-allowed",
          message: "Web Speech Recognition API não disponível neste navegador.",
        },
      };
    }

    return {
      supported: true,
      provider: "web-speech",
      error: undefined,
    };
  },

  getStatus: async () => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    const SpeechRecognition =
      globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition;

    return {
      provider: "web-speech",
      available: !!SpeechRecognition,
    };
  },

  start: async (options?: { language?: string }): Promise<void> => {
    // Implementation will be done via the hook using the native API directly
    // This is a placeholder for the service interface
    return Promise.resolve();
  },

  stop: async (): Promise<void> => {
    return Promise.resolve();
  },

  abort: async (): Promise<void> => {
    return Promise.resolve();
  },

  getPreferences: (): SpeechRecognitionPreferences => ({
    provider: "web-speech",
    language: "pt-BR",
    continuous: false,
    interimResults: true,
    maxAlternatives: 1,
  }),

  setPreferences: async (): Promise<void> => {
    // Preferences are managed by the consumer
  },
};