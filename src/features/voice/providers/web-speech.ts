import type {
  VoiceProviderId,
  VoicePreferences,
  VoiceService,
} from "../types";

// Provider Web Speech API - sem necessidade de API Key
// Utiliza o mecanismo nativo do navegador: SpeechSynthesis API

let activeFinish: (() => void) | null = null;

function stopActiveSynthesis(globalWindow: Window & typeof globalThis) {
  if (activeFinish) {
    const finish = activeFinish;
    activeFinish = null;
    finish();
  }
  globalWindow.speechSynthesis?.cancel();
}

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
      throw new Error("Web Speech API não disponível neste navegador.");
    }

    const cleanText = text.trim();
    if (!cleanText) return;

    stopActiveSynthesis(globalWindow);

    const rate = options?.rate ?? 1;
    const voiceName = options?.voice ?? "";

    const voices: SpeechSynthesisVoice[] = globalWindow.speechSynthesis.getVoices?.() ?? [];
    const selectedVoice: SpeechSynthesisVoice | null = voiceName
      ? voices.find((v) => v.name.toLowerCase().includes(voiceName.toLowerCase())) ?? null
      : null;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = Math.max(0.1, Math.min(3, rate ?? 1));
    utterance.volume = Math.max(0, Math.min(1, options?.volume ?? 1));

    if (selectedVoice || !voiceName) {
      const fallbackVoice: SpeechSynthesisVoice | null =
        voices.find((v) => v.default) ?? (voices.length > 0 ? voices[0] : null);
      utterance.voice = selectedVoice ?? fallbackVoice;
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
        if (activeFinish === cancelResolve) {
          activeFinish = null;
        }
      };

      const cancelResolve = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      activeFinish = cancelResolve;

      utterance.onstart = () => {
        // Síntese iniciada na instância da utterance
      };

      utterance.onend = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (event?.error === "canceled" || event?.error === "interrupted") {
          resolve();
          return;
        }
        reject(new Error(`Erro na síntese de áudio${event?.error ? `: ${event.error}` : ""}`));
      };

      globalWindow.speechSynthesis.speak(utterance);
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
    stopActiveSynthesis(globalWindow);
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
