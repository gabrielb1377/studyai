export type VoiceProviderId = "web-speech" | "kokoro" | "remote";

export type VoiceProviderStatus = "available" | "unavailable" | "not-supported";

export interface VoicePreferences {
  provider: VoiceProviderId;
  voice: string;
  rate: number; // 0.75, 1, 1.25, 1.5, 2
  volume: number; // 0.0 to 1.0
  autoplay: boolean;
}

export interface VoiceEvent {
  type: "start" | "pause" | "resume" | "stop" | "done" | "error";
  text?: string;
  utterance?: SpeechSynthesisUtterance;
}

export interface VoiceError {
  code: "NOT_SUPPORTED" | "NOT_ALLOWED" | "SYNTHESIS_FAILED" | "NETWORK_ERROR" | "ABORTED";
  message: string;
}

export interface VoiceService {
  // Inicialização e status
  init(): Promise<{ supported: boolean; provider: VoiceProviderId; error?: VoiceError }>;
  getStatus(): Promise<{ provider: VoiceProviderId; available: boolean; error?: VoiceError }>;

  // Controle de reprodução
  speak(text: string, options?: { rate?: number; voice?: string; volume?: number }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;

  // Preferências
  getPreferences(): VoicePreferences;
  setPreferences(prefs: Partial<VoicePreferences>): Promise<void>;

  // Lista de vozes disponíveis
  getAvailableVoices(): SpeechSynthesisVoice[];
}