import "server-only";

import type {
  VoiceProviderId,
  VoicePreferences,
  VoiceEvent,
  VoiceError,
} from "../voice/types";

// Interface for the voice service - desacoplado das implementações
export interface VoiceService {
  // Inicialização e status
  init(): Promise<{ supported: boolean; provider: VoiceProviderId; error?: VoiceError }>;
  getStatus(): Promise<{ provider: VoiceProviderId; available: boolean; error?: VoiceError }>;

  // Controle de reprodução
  speak(text: string, options?: { rate?: number; voice?: string }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;

  // Preferências
  getPreferences(): VoicePreferences;
  setPreferences(prefs: Partial<VoicePreferences>): Promise<void>;

  // Lista de vozes disponíveis
  getAvailableVoices(): SpeechSynthesisVoice[];
}

// Factory function - retorna a implementação baseada no ambiente
export function createVoiceService(): VoiceService {
  // Verificar se Web Speech API está disponível
  const window = (globalThis as unknown as { speechSynthesis?: any }).speechSynthesis;
  const hasWebSpeech = typeof window?.speak === "function";

  if (hasWebSpeech) {
    return createWebSpeechService();
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

function createWebSpeechService(): VoiceService {
  let voices: SpeechSynthesisVoice[] = [];
  let isSpeaking = false;
  let isPaused = false;
  let pendingText = "";
  let pendingOptions: { rate?: number; voice?: string } | null = null;

  // Carregar vozes quando disponíveis
  const loadVoices = () => {
    voices = window?.speechSynthesis?.getVoices() ?? [];
  };

  // Inicializar ao carregar
  loadVoices();
  if (window?.speechSynthesis?.onvoiceschanged !== undefined) {
    window?.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
  }

  return {
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

    speak: async (text: string, options: { rate?: number; voice?: string } = {}) => {
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

      utterance.onend = () => {
        isSpeaking = false;
        isPaused = false;
        pendingText = "";
        // Processar próximo na fila se houver
        if (pendingText) {
          speak(pendingText, pendingOptions);
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
      provider: "web-speech",
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

  function stopInternal() {
    window?.speechSynthesis?.cancel();
    isSpeaking = false;
    isPaused = false;
    pendingText = "";
    pendingOptions = null;
  }
}