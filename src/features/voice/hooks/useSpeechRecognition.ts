import { useEffect, useState, useCallback, useRef } from "react";
import type {
  SpeechRecognitionPreferences,
  SpeechRecognitionError,
  SpeechRecognitionService,
} from "@/features/voice/types";
import { createSpeechRecognitionService } from "@/features/voice/services";

export type SpeechRecognitionState =
  | "idle"
  | "listening"
  | "transcribing"
  | "error";

export interface UseSpeechRecognitionReturn {
  status: SpeechRecognitionState;
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  error: SpeechRecognitionError | null;
  language: string;
  setLanguage: (lang: string) => void;
  startListening: (options?: { continuous?: boolean; interimResults?: boolean }) => Promise<void>;
  stopListening: () => Promise<void>;
  abortListening: () => Promise<void>;
  clearTranscript: () => void;
  preferences: SpeechRecognitionPreferences;
  setPreferences: (prefs: Partial<SpeechRecognitionPreferences>) => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [status, setStatus] = useState<SpeechRecognitionState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<SpeechRecognitionError | null>(null);
  const [preferences, setPreferences] = useState<SpeechRecognitionPreferences>({
    provider: "web-speech",
    language: "pt-BR",
    continuous: false,
    interimResults: true,
    maxAlternatives: 1,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const serviceRef = useRef<SpeechRecognitionService | null>(null);
  const isInitializedRef = useRef(false);
  const finalTranscriptRef = useRef("");

  // Initialize service
  useEffect(() => {
    const service = createSpeechRecognitionService();
    serviceRef.current = service;
    void service.init().then(({ supported, error }) => {
      if (!supported) {
        setStatus("error");
        setError(error ?? { code: "not-allowed", message: "Reconhecimento de fala não suportado" });
      }
    });
    isInitializedRef.current = true;
    return () => {
      // Cleanup on unmount
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  // Load preferences from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("studyai:voice-recognition-preferences:v1");
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SpeechRecognitionPreferences>;
        setPreferences((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore parsing errors
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("studyai:voice-recognition-preferences:v1", JSON.stringify(preferences));
  }, [preferences]);

  // Initialize SpeechRecognition instance
  const ensureRecognition = useCallback((): SpeechRecognition | null => {
    if (recognitionRef.current) return recognitionRef.current;

    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    const SpeechRecognition = globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = preferences.language;
    recognition.continuous = preferences.continuous;
    recognition.interimResults = preferences.interimResults;
    recognition.maxAlternatives = preferences.maxAlternatives;

    recognition.onstart = () => {
      setStatus("listening");
      setError(null);
      finalTranscriptRef.current = "";
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          final += transcript + " ";
        } else {
          interim += transcript;
        }
      }

      finalTranscriptRef.current = final;
      setTranscript(final.trim());
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: Event) => {
      const errorEvent = event as unknown as { error: string };
      const errorMap: Record<string, SpeechRecognitionError["code"]> = {
        "not-allowed": "not-allowed",
        "no-speech": "no-speech",
        "audio-capture": "audio-capture",
        network: "network",
        aborted: "aborted",
        "service-not-allowed": "service-not-allowed",
        "bad-grammar": "bad-grammar",
        "language-not-supported": "language-not-supported",
      };
      const code = errorMap[errorEvent.error] || "network";
      const err: SpeechRecognitionError = {
        code,
        message: `Erro no reconhecimento: ${errorEvent.error}`,
      };
      setError(err);
      setStatus("error");
    };

    recognition.onend = () => {
      if (status !== "error") {
        setStatus("idle");
      }
      // If continuous mode, restart automatically
      if (preferences.continuous && status !== "error") {
        try {
          recognitionRef.current?.start();
        } catch {
          // Ignore restart errors
        }
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [preferences, status]);

  const startListening = useCallback(
    async (options?: { continuous?: boolean; interimResults?: boolean }) => {
      const recognition = ensureRecognition();
      if (!recognition) {
        const err: SpeechRecognitionError = {
          code: "not-allowed",
          message: "Reconhecimento de fala não disponível neste navegador",
        };
        setError(err);
        setStatus("error");
        return;
      }

      try {
        setError(null);
        finalTranscriptRef.current = "";
        setTranscript("");
        setInterimTranscript("");
        setStatus("listening");

        if (options?.continuous !== undefined) {
          recognition.continuous = options.continuous;
        }
        if (options?.interimResults !== undefined) {
          recognition.interimResults = options.interimResults;
        }

        recognition.start();
      } catch {
        const err: SpeechRecognitionError = {
          code: "audio-capture",
          message: "Não foi possível iniciar o microfone",
        };
        setError(err);
        setStatus("error");
      }
    }, [ensureRecognition]);

  const stopListening = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setStatus("idle");
  }, []);

  const abortListening = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setStatus("idle");
    setInterimTranscript("");
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    finalTranscriptRef.current = "";
  }, []);

  const setLanguage = useCallback((lang: string) => {
    setPreferences((prev) => ({ ...prev, language: lang }));
  }, []);

  const setPreferencesHandler = useCallback(
    (prefs: Partial<SpeechRecognitionPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...prefs }));
    },
    []
  );

  return {
    status,
    transcript,
    interimTranscript,
    isListening: status === "listening",
    error,
    language: preferences.language,
    setLanguage,
    startListening,
    stopListening,
    abortListening,
    clearTranscript,
    preferences,
    setPreferences: setPreferencesHandler,
  };
}