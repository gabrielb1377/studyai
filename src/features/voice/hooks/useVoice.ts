import { useEffect, useState, useCallback, useRef } from "react";
import { VoiceService, VoicePreferences, VoiceError } from "@/features/voice/types";
import { createVoiceService } from "@/features/voice/services";

// Hook customizado para gerenciar estado de voz e controles
export function useVoice() {
  const [status, setStatus] = useState<{
    provider: string;
    available: boolean;
    isSpeaking: boolean;
    isPaused: boolean;
    error?: VoiceError;
  }>({
    provider: "web-speech",
    available: false,
    isSpeaking: false,
    isPaused: false,
    error: undefined,
  });

  const [preferences, setPreferences] = useState<VoicePreferences>({
    provider: "web-speech",
    voice: "",
    rate: 1,
    volume: 1,
    autoplay: false,
  });

  const voiceRef = useRef<VoiceService | null>(null);

  // Inicializar service
  useEffect(() => {
    const service = createVoiceService();
    voiceRef.current = service;

    // Atualizar status inicial
    void service.init().then(({ supported, provider, error }) => {
      setStatus({
        provider,
        available: supported,
        isSpeaking: false,
        isPaused: false,
        error: error ?? undefined,
      });
    });

    const cleanup = () => {
      void service.stop();
      voiceRef.current = null;
    };
    return cleanup;
  }, []);

  // Funções de controle
  const speak = useCallback(
    async (text: string, options?: { rate?: number; voice?: string }) => {
      if (!text?.trim()) return;
      setStatus((prev) => ({ ...prev, isSpeaking: true, isPaused: false, error: undefined }));
      try {
        await voiceRef.current?.speak(text, options);
      } catch (e) {
        setStatus((prev) => ({ ...prev, isSpeaking: false, error: { code: "SYNTHESIS_FAILED", message: (e as Error).message } }));
      }
    },
    []
  );

  const pause = useCallback(async () => {
    if (voiceRef.current) {
      await voiceRef.current.pause();
      setStatus((prev) => ({ ...prev, isPaused: true }));
    }
  }, []);

  const resume = useCallback(async () => {
    if (voiceRef.current) {
      await voiceRef.current.resume();
      setStatus((prev) => ({ ...prev, isPaused: false }));
    }
  }, []);

  const stop = useCallback(async () => {
    if (voiceRef.current) {
      await voiceRef.current.stop();
      setStatus((prev) => ({ ...prev, isSpeaking: false, isPaused: false }));
    }
  }, []);

  const setPreferencesHandler = useCallback(
    async (prefs: Partial<VoicePreferences>) => {
      if (voiceRef.current) {
        await voiceRef.current.setPreferences(prefs);
        setPreferences((prev) => ({ ...prev, ...prefs }));
      }
    },
    []
  );

  return {
    // Status
    status,
    preferences,

    // Controle
    speak,
    pause,
    resume,
    stop,

    // Preferências
    setPreferences: setPreferencesHandler,

    // Utilitários
    getAvailableVoices: () => voiceRef.current?.getAvailableVoices() ?? [],

    // Reset
    reset: () => {
      setStatus({
        provider: "web-speech",
        available: false,
        isSpeaking: false,
        isPaused: false,
        error: undefined,
      });
      setPreferences({
        provider: "web-speech",
        voice: "",
        rate: 1,
        volume: 1,
        autoplay: false,
      });
    },
  };
}