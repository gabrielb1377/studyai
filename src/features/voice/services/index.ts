import type {
  VoiceProviderId,
  VoicePreferences,
  VoiceService,
  SpeechRecognitionService,
} from "../types";

// Factory function - retorna a implementação baseada no ambiente
export function createVoiceService(): VoiceService {
  const win = globalThis as unknown as { speechSynthesis?: SpeechSynthesis };
  const hasWebSpeech = typeof win?.speechSynthesis?.speak === "function";

  if (hasWebSpeech) {
    return createWebSpeechService(win);
  }

  return {
    init: async () => ({
      supported: false,
      provider: "web-speech",
      error: { code: "NOT_SUPPORTED", message: "Web Speech API não suportada neste ambiente." },
    }),
    getStatus: async () => ({
      provider: "web-speech",
      available: false,
      error: { code: "NOT_SUPPORTED", message: "Web Speech API não suportada." },
    }),
    speak: async () => {
      throw new Error("Síntese de voz não suportada neste navegador.");
    },
    pause: async () => {},
    resume: async () => {},
    stop: async () => {},
    getPreferences: () => ({
      provider: "web-speech",
      voice: "",
      rate: 1,
      volume: 1,
      autoplay: false,
    }),
    setPreferences: async () => {},
    getAvailableVoices: () => [],
  };
}

// Factory function - retorna a implementação de reconhecimento de fala
export function createSpeechRecognitionService(): SpeechRecognitionService {
  const globalWindow = globalThis as unknown as Window & typeof globalThis;
  const SpeechRecognition =
    globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return {
      init: async () => ({
        supported: false,
        provider: "web-speech",
        error: {
          code: "not-allowed",
          message: "Reconhecimento de fala não disponível neste navegador.",
        },
      }),
      getStatus: async () => ({
        provider: "web-speech",
        available: false,
        error: {
          code: "not-allowed",
          message: "Reconhecimento de fala não disponível.",
        },
      }),
      start: async () => {},
      stop: async () => {},
      abort: async () => {},
      getPreferences: () => ({
        provider: "web-speech",
        language: "pt-BR",
        continuous: false,
        interimResults: true,
        maxAlternatives: 1,
      }),
      setPreferences: async () => {},
    };
  }

  return {
    init: async () => ({
      supported: true,
      provider: "web-speech",
      error: undefined,
    }),
    getStatus: async () => ({
      provider: "web-speech",
      available: true,
    }),
    start: async () => Promise.resolve(),
    stop: async () => Promise.resolve(),
    abort: async () => Promise.resolve(),
    getPreferences: () => ({
      provider: "web-speech",
      language: "pt-BR",
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
    }),
    setPreferences: async () => {},
  };
}

function createWebSpeechService(win: { speechSynthesis?: SpeechSynthesis }): VoiceService {
  let voices: SpeechSynthesisVoice[] = [];
  let isSpeaking = false;
  let isPaused = false;
  let settleActive: (() => void) | null = null;
  let activeUtterance: SpeechSynthesisUtterance | null = null;

  const loadVoices = () => {
    voices = win?.speechSynthesis?.getVoices?.() ?? [];
  };

  loadVoices();
  if (win?.speechSynthesis && typeof win.speechSynthesis.addEventListener === "function") {
    win.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  }

  function clearUtteranceHandlers(utterance: SpeechSynthesisUtterance | null) {
    if (!utterance) return;
    utterance.onstart = null;
    utterance.onpause = null;
    utterance.onresume = null;
    utterance.onend = null;
    utterance.onerror = null;
  }

  function stopInternal() {
    clearUtteranceHandlers(activeUtterance);
    activeUtterance = null;
    if (settleActive) {
      const finish = settleActive;
      settleActive = null;
      finish();
    }
    win?.speechSynthesis?.cancel();
    isSpeaking = false;
    isPaused = false;
  }

  const service: VoiceService = {
    init: async () => {
      loadVoices();
      const hasSpeak = typeof win?.speechSynthesis?.speak === "function";
      return {
        supported: hasSpeak,
        provider: "web-speech",
        error: hasSpeak ? undefined : { code: "NOT_SUPPORTED", message: "Nenhuma voz disponível." },
      };
    },

    getStatus: async () => {
      const isAvailable = typeof win?.speechSynthesis?.speak === "function";
      return {
        provider: "web-speech",
        available: isAvailable,
      };
    },

    speak: async (text: string, options: { rate?: number; voice?: string; volume?: number } = {}) => {
      stopInternal();

      const cleanText = text?.trim();
      if (!cleanText) {
        throw new Error("Texto vazio para síntese");
      }

      if (typeof win?.speechSynthesis?.speak !== "function") {
        throw new Error("Síntese de voz indisponível neste navegador.");
      }

      loadVoices();
      const rate = options.rate ?? 1;
      const voiceName = options.voice ?? "";

      const selectedVoice = voiceName
        ? voices.find((v) => v.name === voiceName) || voices.find((v) => v.default)
        : voices.find((v) => v.default) || voices[0];

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = Math.max(0.1, Math.min(3, rate));
      utterance.volume = Math.max(0, Math.min(1, options.volume ?? 1));

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      activeUtterance = utterance;
      isSpeaking = true;
      isPaused = false;

      return new Promise<void>((resolve, reject) => {
        let settled = false;

        const finish = (err?: Error) => {
          if (settled) return;
          settled = true;
          clearUtteranceHandlers(utterance);
          if (activeUtterance === utterance) {
            activeUtterance = null;
          }
          if (settleActive === cancelFinish) {
            settleActive = null;
          }
          isSpeaking = false;
          isPaused = false;
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        };

        const cancelFinish = () => finish();
        settleActive = cancelFinish;

        utterance.onstart = () => {
          isSpeaking = true;
          isPaused = false;
        };

        utterance.onpause = () => {
          isPaused = true;
        };

        utterance.onresume = () => {
          isPaused = false;
        };

        utterance.onend = () => {
          finish();
        };

        utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
          if (event?.error === "canceled" || event?.error === "interrupted") {
            finish();
            return;
          }
          finish(new Error(`Erro na síntese de voz${event?.error ? `: ${event.error}` : ""}`));
        };

        try {
          win.speechSynthesis?.speak(utterance);
        } catch (error) {
          finish(error instanceof Error ? error : new Error("Falha ao iniciar síntese de voz."));
        }
      });
    },

    pause: async () => {
      if (isSpeaking && !isPaused) {
        win?.speechSynthesis?.pause();
        isPaused = true;
      }
    },

    resume: async () => {
      if (isSpeaking && isPaused) {
        win?.speechSynthesis?.resume();
        isPaused = false;
      }
    },

    stop: async () => {
      stopInternal();
    },

    getPreferences: (): VoicePreferences => ({
      provider: "web-speech" as VoiceProviderId,
      voice: "",
      rate: 1,
      volume: 1,
      autoplay: false,
    }),

    setPreferences: async (): Promise<void> => {},

    getAvailableVoices: (): SpeechSynthesisVoice[] => {
      loadVoices();
      return voices;
    },
  };

  return service;
}
