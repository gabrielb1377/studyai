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