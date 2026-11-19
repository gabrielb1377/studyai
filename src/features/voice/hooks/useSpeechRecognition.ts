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
  isSupported: boolean;
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

const RECOGNITION_ERROR_MESSAGES: Record<SpeechRecognitionError["code"], string> = {
  "not-allowed": "Permissão do microfone negada. Autorize o acesso nas configurações do navegador ou digite sua mensagem.",
  "service-not-allowed": "O serviço de reconhecimento de fala foi bloqueado pelo navegador.",
  "audio-capture": "Nenhum microfone disponível ou acessível neste dispositivo.",
  "no-speech": "Nenhuma fala foi detectada. Tente novamente ou digite sua pergunta.",
  network: "Não foi possível conectar ao serviço de reconhecimento de fala do navegador.",
  aborted: "Reconhecimento de fala cancelado.",
  "bad-grammar": "Não foi possível interpretar o áudio capturado.",
  "language-not-supported": "O idioma selecionado não é suportado pelo navegador.",
};

function clearRecognitionHandlers(recognition: SpeechRecognition | null) {
  if (!recognition) return;
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isSupported, setIsSupported] = useState(false);
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
  const finalTranscriptRef = useRef("");
  const statusRef = useRef<SpeechRecognitionState>("idle");
  const continuousRef = useRef(preferences.continuous);

  const updateStatus = useCallback((next: SpeechRecognitionState) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    continuousRef.current = preferences.continuous;
  }, [preferences.continuous]);

  useEffect(() => {
    const service = createSpeechRecognitionService();
    serviceRef.current = service;
    void service.init().then(({ supported, error: initError }) => {
      setIsSupported(supported);
      if (!supported) {
        setError(initError ?? {
          code: "not-allowed",
          message: "Reconhecimento de fala não suportado neste navegador.",
        });
      }
    });

    return () => {
      if (recognitionRef.current) {
        clearRecognitionHandlers(recognitionRef.current);
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore abort cleanup error
        }
        recognitionRef.current = null;
      }
    };
  }, []);

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
    try {
      localStorage.setItem("studyai:voice-recognition-preferences:v1", JSON.stringify(preferences));
    } catch {
      // Ignore storage quota errors
    }
  }, [preferences]);

  const createRecognition = useCallback((): SpeechRecognition | null => {
    if (recognitionRef.current) {
      clearRecognitionHandlers(recognitionRef.current);
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore previous abort errors
      }
      recognitionRef.current = null;
    }

    const globalWindow = globalThis as unknown as Window & typeof globalThis;
    const SpeechRecognitionCtor = globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return null;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = preferences.language;
    recognition.continuous = preferences.continuous;
    recognition.interimResults = preferences.interimResults;
    recognition.maxAlternatives = preferences.maxAlternatives;

    recognition.onstart = () => {
      updateStatus("listening");
      setError(null);
      finalTranscriptRef.current = "";
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const part = result[0]?.transcript ?? "";
        if (result.isFinal) {
          final += `${part} `;
        } else {
          interim += part;
        }
      }

      finalTranscriptRef.current = final;
      setTranscript(final.trim());
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event: Event) => {
      const errorEvent = event as unknown as { error?: string };
      const rawCode = errorEvent.error ?? "network";
      const code = (
        rawCode in RECOGNITION_ERROR_MESSAGES ? rawCode : "network"
      ) as SpeechRecognitionError["code"];

      if (code === "aborted") {
        updateStatus("idle");
        setInterimTranscript("");
        return;
      }

      setError({
        code,
        message: RECOGNITION_ERROR_MESSAGES[code],
      });
      updateStatus("error");
      setInterimTranscript("");
    };

    recognition.onend = () => {
      if (statusRef.current !== "error") {
        updateStatus("idle");
      }
      setInterimTranscript("");
      if (continuousRef.current && statusRef.current !== "error") {
        try {
          recognitionRef.current?.start();
        } catch {
          // Ignore restart errors
        }
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [preferences, updateStatus]);

  const startListening = useCallback(
    async (options?: { continuous?: boolean; interimResults?: boolean }) => {
      const recognition = createRecognition();
      if (!recognition) {
        setIsSupported(false);
        setError({
          code: "not-allowed",
          message: "Reconhecimento de fala não disponível neste navegador. Use a digitação normalmente.",
        });
        updateStatus("error");
        return;
      }

      try {
        setError(null);
        finalTranscriptRef.current = "";
        setTranscript("");
        setInterimTranscript("");
        updateStatus("listening");

        if (options?.continuous !== undefined) {
          recognition.continuous = options.continuous;
          continuousRef.current = options.continuous;
        }
        if (options?.interimResults !== undefined) {
          recognition.interimResults = options.interimResults;
        }

        recognition.start();
      } catch {
        setError({
          code: "audio-capture",
          message: "Não foi possível iniciar o microfone neste navegador.",
        });
        updateStatus("error");
      }
    },
    [createRecognition, updateStatus],
  );

  const stopListening = useCallback(async () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
    updateStatus("idle");
    setInterimTranscript("");
  }, [updateStatus]);

  const abortListening = useCallback(async () => {
    if (recognitionRef.current) {
      clearRecognitionHandlers(recognitionRef.current);
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors
      }
      recognitionRef.current = null;
    }
    updateStatus("idle");
    setTranscript("");
    setInterimTranscript("");
    finalTranscriptRef.current = "";
  }, [updateStatus]);

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
    [],
  );

  return {
    isSupported,
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
