import type {
  VoiceProviderId,
  VoicePreferences,
  VoiceEvent,
  VoiceError,
  VoiceService,
} from "../types";

// Provider Web Speech API - sem necessidade de API Key
// Utiliza o mecanismo nativo do navegador: SpeechSynthesis API

export const webSpeechProvider: VoiceService = {
  init: async () => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    const hasWebSpeech = typeof globalWindow.speechSynthesis?.speak === "function";

    if (!hasWebSpeech) {
      return {
        supported: false,
        provider: "web-speech",
        error: {
          code: "NOT_SUPPORTED",
          message: "Web Speech API não disponível neste navegador ou dispositivo.",
        },
      };
    }

    // Carregar vozes assim que disponíveis
    const voices = window.speechSynthesis.getVoices?.() ?? [];
    return {
      supported: true,
      provider: "web-speech",
      error: undefined,
    };
  },

  getStatus: async () => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    return {
      provider: "web-speech",
      available: typeof globalWindow.speechSynthesis?.speak === "function",
    };
  },

  speak: async (
    text: string,
    options?: { rate?: number; voice?: string; volume?: number }
  ): Promise<void> => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;

    if (!globalWindow.speechSynthesis?.speak) {
      throw new Error("Web Speech API não disponível");
    }

    const rate = options?.rate ?? 1;
    const voiceName = options?.voice ?? "";

    // Filtrar voz pelo nome ou usar padrão
    const voices: SpeechSynthesisVoice[] = globalWindow.speechSynthesis.getVoices?.() ?? [];
    const selectedVoice: SpeechSynthesisVoice | null = voiceName
      ? voices.find((v) => v.name.toLowerCase().includes(voiceName.toLowerCase())) ?? null
      : null;

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.rate = Math.max(0.1, Math.min(3, rate ?? 1));
    utterance.volume = options?.volume ?? 1;
    utterance.text = text.trim();

    if (selectedVoice || !voiceName) {
      const fallbackVoice: SpeechSynthesisVoice | null = voices.find((v) => v.default) ?? (voices.length > 0 ? voices[0] : null);
      utterance.voice = selectedVoice ?? fallbackVoice;
    }

    // Retornar promise que resolve quando a narração terminar
    return new Promise<void>((resolve, reject) => {
      const handlers = {
        onstart: () => {
          globalWindow.removeEventListener("onstart", handlers.onstart);
        },
        onend: () => {
          globalWindow.removeEventListener("onend", handlers.onend);
          resolve();
        },
        onerror: (e: Event) => {
          globalWindow.removeEventListener("onerror", handlers.onerror);
          reject(new Error("Erro na síntese de áudio"));
        },
      };

      globalWindow.addEventListener("onstart", handlers.onstart);
      globalWindow.addEventListener("onend", handlers.onend);
      globalWindow.addEventListener("onerror", handlers.onerror);

      globalWindow.speechSynthesis?.speak(utterance);
    });
  },

  pause: async () => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    globalWindow.speechSynthesis?.pause();
  },

  resume: async () => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    globalWindow.speechSynthesis?.resume();
  },

  stop: async () => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    globalWindow.speechSynthesis?.cancel();
  },

  getPreferences: (): VoicePreferences => ({
    provider: "web-speech" as VoiceProviderId,
    voice: "",
    rate: 1,
    volume: 1,
    autoplay: false,
  }),

  setPreferences: async (): Promise<void> => {
    // Preferências são gerenciadas pelo componente/consumer
  },

  getAvailableVoices: (): SpeechSynthesisVoice[] => {
    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    return globalWindow.speechSynthesis?.getVoices?.() ?? [];
  },
};