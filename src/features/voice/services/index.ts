import type {
  VoiceProviderId,
  VoicePreferences,
  VoiceEvent,
  VoiceError,
  VoiceService,
} from "../types";

// Factory function - retorna a implementação baseada no ambiente
export function createVoiceService(): VoiceService {
  // Verificar se Web Speech API está disponível
  const window = (globalThis as unknown as { speechSynthesis?: SpeechSynthesis });
  const hasWebSpeech = typeof window?.speechSynthesis?.speak === "function";

  if (hasWebSpeech) {
    return createWebSpeechService(window);
  }

  // Fallback -provider não disponível
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
    speak: async () => {},
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

function createWebSpeechService(window: { speechSynthesis?: SpeechSynthesis }): VoiceService {
  let voices: SpeechSynthesisVoice[] = [];
  let isSpeaking = false;
  let isPaused = false;
  let pendingText = "";
  let pendingOptions: { rate?: number; voice?: string; volume?: number } | null = null;

  // Carregar vozes quando disponíveis
  const loadVoices = () => {
    voices = window?.speechSynthesis?.getVoices() ?? [];
  };

  // Inicializar ao carregar
  loadVoices();
  if (window?.speechSynthesis?.onvoiceschanged !== undefined) {
    window?.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
  }

  const service: VoiceService = {
    init: async () => {
      loadVoices();
      const supported = voices.length > 0 || typeof window?.speechSynthesis?.speak === "function";
      return {
        supported,
        provider: "web-speech",
        error: supported ? undefined : { code: "NOT_SUPPORTED", message: "Nenhuma voz disponível." },
      };
    },

    getStatus: async () => {
      const isAvailable = typeof window?.speechSynthesis?.speak === "function";
      return {
        provider: "web-speech",
        available: isAvailable,
      };
    },

    speak: async (text: string, options: { rate?: number; voice?: string; volume?: number } = {}) => {
      // Cancel any ongoing speech
      stopInternal();

      if (!text?.trim()) {
        throw new Error("Texto vazio para síntese");
      }

      const rate = options.rate ?? 1;
      const voiceName = options.voice ?? "";

      // Filtrar voz selecionada
      const selectedVoice = voiceName
        ? voices.find((v) => v.name === voiceName) || voices.find((v) => v.default)
        : voices.find((v) => v.default) || voices[0];

      const utterance = new SpeechSynthesisUtterance(text.trim());
      utterance.rate = Math.max(0.1, Math.min(3, rate));
      utterance.volume = options.volume ?? 1;
      utterance.text = text.trim();

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // Event handlers
      utterance.onstart = () => {
        isSpeaking = true;
        isPaused = false;
        pendingText = "";
      };

      utterance.onpause = () => {
        isPaused = true;
      };

      utterance.onresume = () => {
        isPaused = false;
      };

      utterance.onend = async () => {
        isSpeaking = false;
        isPaused = false;
        pendingText = "";
        // Processar próximo na fila se houver
        if (pendingText) {
          await service.speak(pendingText, pendingOptions!);
          pendingText = "";
          pendingOptions = null;
        }
      };

      utterance.onerror = (event) => {
        isSpeaking = false;
        isPaused = false;
        pendingText = "";
      };

      window?.speechSynthesis?.speak(utterance);
    },

    pause: async () => {
      if (isSpeaking && !isPaused) {
        window?.speechSynthesis?.pause();
      }
    },

    resume: async () => {
      if (isSpeaking && isPaused) {
        window?.speechSynthesis?.resume();
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

    setPreferences: async (prefs: Partial<VoicePreferences>): Promise<void> => {
      // Preferências são salvas via zustand/localStorage pelo consumer
      // Esta função é um no-op no service layer; o consumer trata a persistência
    },

    getAvailableVoices: (): SpeechSynthesisVoice[] => {
      return voices;
    },
  };

  return service;

  function stopInternal() {
    window?.speechSynthesis?.cancel();
    isSpeaking = false;
    isPaused = false;
    pendingText = "";
    pendingOptions = null;
  }
}