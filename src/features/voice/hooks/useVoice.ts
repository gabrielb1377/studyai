import { useEffect, useState, useCallback, useRef } from "react";
import { VoiceService, VoicePreferences, VoiceError } from "@/features/voice/types";
import { createVoiceService } from "@/features/voice/services";

const VOICE_STOP_ALL_EVENT = "studyai:voice-stop-all";

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
  const instanceIdRef = useRef(`voice-${Math.random().toString(36).slice(2, 10)}`);
  const playbackTokenRef = useRef(0);

  useEffect(() => {
    const service = createVoiceService();
    voiceRef.current = service;

    void service.init().then(({ supported, provider, error }) => {
      setStatus({
        provider,
        available: supported,
        isSpeaking: false,
        isPaused: false,
        error: error ?? undefined,
      });
    });

    const handleGlobalStop = (event: Event) => {
      const customEvent = event as CustomEvent<{ owner?: string }>;
      if (customEvent.detail?.owner === instanceIdRef.current) return;
      playbackTokenRef.current += 1;
      setStatus((prev) => (prev.isSpeaking || prev.isPaused ? { ...prev, isSpeaking: false, isPaused: false } : prev));
    };

    const handlePageHide = () => {
      playbackTokenRef.current += 1;
      void service.stop();
      setStatus((prev) => ({ ...prev, isSpeaking: false, isPaused: false }));
    };

    if (typeof window !== "undefined") {
      window.addEventListener(VOICE_STOP_ALL_EVENT, handleGlobalStop);
      window.addEventListener("pagehide", handlePageHide);
    }

    return () => {
      playbackTokenRef.current += 1;
      if (typeof window !== "undefined") {
        window.removeEventListener(VOICE_STOP_ALL_EVENT, handleGlobalStop);
        window.removeEventListener("pagehide", handlePageHide);
      }
      void service.stop();
      voiceRef.current = null;
    };
  }, []);

  const speak = useCallback(
    async (text: string, options?: { rate?: number; voice?: string; volume?: number }) => {
      if (!text?.trim()) return;
      if (!voiceRef.current) return;

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(VOICE_STOP_ALL_EVENT, { detail: { owner: instanceIdRef.current } }),
        );
      }

      const token = ++playbackTokenRef.current;
      setStatus((prev) => ({ ...prev, isSpeaking: true, isPaused: false, error: undefined }));
      try {
        await voiceRef.current.speak(text, {
          rate: options?.rate ?? preferences.rate,
          voice: options?.voice ?? preferences.voice,
          volume: options?.volume ?? preferences.volume,
        });
        if (playbackTokenRef.current === token) {
          setStatus((prev) => ({ ...prev, isSpeaking: false, isPaused: false }));
        }
      } catch (e) {
        if (playbackTokenRef.current === token) {
          setStatus((prev) => ({
            ...prev,
            isSpeaking: false,
            isPaused: false,
            error: {
              code: "SYNTHESIS_FAILED",
              message: e instanceof Error ? e.message : "Erro na síntese de voz.",
            },
          }));
        }
      }
    },
    [preferences.rate, preferences.voice, preferences.volume],
  );

  const pause = useCallback(async () => {
    if (voiceRef.current) {
      await voiceRef.current.pause();
      setStatus((prev) => (prev.isSpeaking ? { ...prev, isPaused: true } : prev));
    }
  }, []);

  const resume = useCallback(async () => {
    if (voiceRef.current) {
      await voiceRef.current.resume();
      setStatus((prev) => (prev.isSpeaking ? { ...prev, isPaused: false } : prev));
    }
  }, []);

  const stop = useCallback(async () => {
    playbackTokenRef.current += 1;
    if (voiceRef.current) {
      await voiceRef.current.stop();
    }
    setStatus((prev) => ({ ...prev, isSpeaking: false, isPaused: false }));
  }, []);

  const setPreferencesHandler = useCallback(
    async (prefs: Partial<VoicePreferences>) => {
      if (voiceRef.current) {
        await voiceRef.current.setPreferences(prefs);
        setPreferences((prev) => ({ ...prev, ...prefs }));
      }
    },
    [],
  );

  return {
    status,
    preferences,
    speak,
    pause,
    resume,
    stop,
    setPreferences: setPreferencesHandler,
    getAvailableVoices: () => voiceRef.current?.getAvailableVoices() ?? [],
    reset: () => {
      playbackTokenRef.current += 1;
      void voiceRef.current?.stop();
      setStatus((prev) => ({
        ...prev,
        isSpeaking: false,
        isPaused: false,
        error: undefined,
      }));
    },
  };
}
