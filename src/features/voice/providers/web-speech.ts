import "server-only";

import type {
  VoiceProviderId,
  VoicePreferences,
  VoiceEvent,
  VoiceError,
} from "../types";
import { VoiceService } from "../services";

// Provider Web Speech API - sem necessidade de API Key
// Utiliza o mecanismo nativo do navegador: SpeechSynthesis API

export const webSpeechProvider: VoiceService = {
  init: async () => {
    const window = (globalThis as unknown as { speechSynthesis?: any })
      .speechSynthesis;
    const hasWebSpeech = typeof window?.speak === "function";

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
    const window = (globalThis as unknown as { speechSynthesis?: any })
      .speechSynthesis;
    return {
      provider: "web-speech",
      available: typeof window?.speak === "function",
    };
  },

  speak: async (
    text: string,
    options?: { rate?: number; voice?: string }
  ): Promise<void> => {
    const window = (globalThis as unknown as { speechSynthesis?: any })
      .speechSynthesis;

    if (!window?.speak) {
      throw new Error("Web Speech API não disponível");
    }

    const rate = options?.rate ?? 1;
    const voiceName = options?.voice ?? "";

    // Filtrar voz pelo nome ou usar padrão
    const voices: SpeechSynthesisVoice[] = window.speechSynthesis.getVoices ?? [];
    const selectedVoice =
      voiceName &&
      voices.find((v) => v.name.toLowerCase().includes(voiceName.toLowerCase()));
    const voice = selectedVoice ?? voices.find((v) => v.default) ?? voices[0];

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.rate = Math.max(0.1, Math.min(3, rate ?? 1));
    utterance.volume = options?.volume ?? 1;
    utterance.text = text.trim();

    if (selectedVoice || !voiceName) {
      utterance.voice = selectedVoice ?? voices.find((v) => v.default) ?? voices[0];
    }

    // Retornar promise que resolve quando a narração terminar
    return new Promise<void>((resolve, reject) => {
      const handlers = {
        onstart: () => {
          window?.removeEventListener("onstart", handlers.onstart);
        },
        onend: () => {
          window?.removeEventListener("onend", handlers.onend);
          resolve();
        },
        onerror: (e: Event) => {
          window?.removeEventListener("onerror", handlers.onerror);
          reject(new Error("Erro na síntese de áudio"));
        },
      };

      window?.addEventListener("onstart", handlers.onstart);
      window?.addEventListener("onend", handlers.onend);
      window?.addEventListener("onerror", handlers.onerror);

      window?.speechSynthesis?.speak(utterance);
    });
  },

  pause: async () => {
    const window = (globalThis as unknown as { speechSynthesis?: any })
      .speechSynthesis;
    window?.speechSynthesis?.pause();
  },

  resume: async () => {
    const window = (globalThis as unknown as { speechSynthesis?: any })
      .speechSynthesis;
    window?.speechSynthesis?.resume();
  },

  stop: async () => {
    const window = (globalThis as unknown as { speechSynthesis?: any })
      .speechSynthesis;
    window?.speechSynthesis?.cancel();
  },

  getPreferences: (): VoicePreferences => ({
    provider: "web-speech",
    voice: "",
    rate: 1,
    volume: 1,
    autoplay: false,
  }),

  setPreferences: async (): Promise<void> => {
    // Preferências são gerenciadas pelo componente/consumer
  },

  getAvailableVoices: (): SpeechSynthesisVoice[] => {
    const window = (globalThis as unknown as { speechSynthesis?: any })
      .speechSynthesis;
    return window.speechSynthesis.getVoices?.() ?? [];
  },
};